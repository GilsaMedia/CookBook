import type { ImageFiles } from "@/lib/data/imports";
import type { ImportEntry } from "./types";

/**
 * Imports straight from Google Keep with the official Keep API, like the
 * original cookbook app: Google sign-in (Google Identity Services) asks the
 * owner to allow read-only Keep access, then the notes and their photos are
 * read here in the browser. The access token lives only in memory for this
 * import and is revoked when it's done.
 *
 * Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID: an OAuth client whose project has the
 * Keep API enabled and lists this site under Authorized JavaScript origins.
 */

const KEEP_API = "https://keep.googleapis.com/v1";
const SCOPE = "https://www.googleapis.com/auth/keep.readonly";
const GIS_SRC = "https://accounts.google.com/gsi/client";

export const keepApiClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/** Why Keep couldn't be read; mapped to Hebrew in he.ts. */
export class KeepApiError extends Error {}

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type Gis = {
  accounts: {
    oauth2: {
      initTokenClient: (o: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type?: string }) => void;
      }) => TokenClient;
      revoke: (token: string, done?: () => void) => void;
    };
  };
};

let gisLoading: Promise<Gis> | null = null;

function loadGis(): Promise<Gis> {
  const existing = (window as unknown as { google?: Gis }).google;
  if (existing?.accounts?.oauth2) return Promise.resolve(existing);
  gisLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve((window as unknown as { google: Gis }).google);
    script.onerror = () => {
      gisLoading = null;
      reject(new KeepApiError("failed"));
    };
    document.head.appendChild(script);
  });
  return gisLoading;
}

/** Opens Google's consent popup and resolves with a short-lived access token. */
export async function connectKeep(): Promise<string> {
  if (!keepApiClientId) throw new KeepApiError("not_configured");
  const gis = await loadGis();
  return new Promise((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: keepApiClientId,
      scope: SCOPE,
      callback: (r) =>
        r.access_token ? resolve(r.access_token) : reject(new KeepApiError("denied")),
      error_callback: (e) =>
        reject(new KeepApiError(e.type === "popup_closed" ? "popup_closed" : "denied")),
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

/** Ends the token as soon as the notes are read. */
export async function disconnectKeep(token: string) {
  try {
    (await loadGis()).accounts.oauth2.revoke(token);
  } catch {
    // The token expires within the hour anyway.
  }
}

type ApiText = { text?: string };
type ApiListItem = { text?: ApiText; checked?: boolean; childListItems?: ApiListItem[] };
type ApiNote = {
  name: string;
  title?: string;
  createTime?: string;
  trashed?: boolean;
  body?: { text?: ApiText; list?: { listItems?: ApiListItem[] } };
  attachments?: { name: string; mimeType?: string[] }[];
};

async function keepFetch(token: string, path: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${KEEP_API}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new KeepApiError("failed");
  }
  if (res.ok) return res;
  const body = await res.text().catch(() => "");
  if (res.status === 401) throw new KeepApiError("denied");
  if (res.status === 403 && /SERVICE_DISABLED|accessNotConfigured|has not been used/i.test(body)) {
    throw new KeepApiError("api_disabled");
  }
  // Google only opens the Keep API to Workspace accounts; personal ones get 403.
  if (res.status === 403) throw new KeepApiError("personal_account");
  throw new KeepApiError("failed");
}

const URL_ONLY = /^\s*(https?:\/\/\S+)\s*$/i;

function listText(items: ApiListItem[] = [], depth = 0): string[] {
  return items.flatMap((i) => [
    ...(i.text?.text?.trim() ? [`${"  ".repeat(depth)}- ${i.text.text.trim()}`] : []),
    ...listText(i.childListItems, depth + 1),
  ]);
}

/** Turns one Keep API note into an import entry (same rules as Takeout). */
export function noteToEntry(note: ApiNote, imageKeys: string[]): ImportEntry | null {
  if (note.trashed) return null;
  const title = note.title?.trim() ?? "";
  const body = [note.body?.text?.text?.trim() ?? "", ...listText(note.body?.list?.listItems)]
    .filter(Boolean)
    .join("\n");
  const link = body.match(URL_ONLY)?.[1] ?? null;
  const kind: ImportEntry["kind"] = link ? "link" : body ? "recipe" : "empty";
  return {
    key: note.name,
    title: title || link || "",
    group: null,
    labels: [],
    kind,
    text: kind === "recipe" ? [title && `Title: ${title}`, body].filter(Boolean).join("\n") : "",
    sourceUrl: link,
    sourceName: link ? new URL(link).hostname.replace(/^www\./, "") : null,
    createdAt: note.createTime ?? null,
    images: imageKeys,
  };
}

/**
 * Reads every note and its photos. Calls onProgress with how many notes
 * have been read so far.
 */
export async function readKeepNotes(
  token: string,
  onProgress: (notes: number) => void,
): Promise<{ entries: ImportEntry[]; images: ImageFiles }> {
  const notes: ApiNote[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ pageSize: "100", filter: "trashed=false" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = (await (await keepFetch(token, `notes?${params}`)).json()) as {
      notes?: ApiNote[];
      nextPageToken?: string;
    };
    notes.push(...(data.notes ?? []));
    onProgress(notes.length);
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);

  const images: ImageFiles = new Map();
  const entries: ImportEntry[] = [];
  const photoJobs: (() => Promise<void>)[] = [];
  for (const note of notes) {
    const keys: string[] = [];
    for (const a of note.attachments ?? []) {
      const type = a.mimeType?.find((m) => m.startsWith("image/"));
      if (!type) continue;
      const key = `keep-api/${a.name}`;
      keys.push(key);
      photoJobs.push(async () => {
        try {
          const res = await keepFetch(
            token,
            `${a.name}?alt=media&mimeType=${encodeURIComponent(type)}`,
          );
          images.set(key, { bytes: new Uint8Array(await res.arrayBuffer()), type });
        } catch {
          // A missing photo shouldn't stop the import.
        }
      });
    }
    const entry = noteToEntry(note, keys);
    if (entry) entries.push(entry);
  }
  for (let i = 0; i < photoJobs.length; i += 4) {
    await Promise.all(photoJobs.slice(i, i + 4).map((job) => job()));
  }
  return { entries, images };
}
