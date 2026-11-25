/**
 * Cookbook documents straight from Google Drive: Google's file picker hands
 * this app the one document the user picks, read without downloading.
 *
 * Uses the narrowest Drive permission (drive.file): the app sees only the
 * files the user picks, so Google shows no "unverified app" warning. The
 * access token lives in memory for one import and is revoked afterwards.
 *
 * Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID (OAuth client; this site under
 * Authorized JavaScript origins) and NEXT_PUBLIC_GOOGLE_API_KEY (browser key
 * for the Picker API). The project number for the picker is the client ID's
 * prefix.
 */

export const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
export const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
export const driveImportReady = Boolean(googleClientId && googleApiKey);

const SCOPE = "https://www.googleapis.com/auth/drive.file";

/** Why Drive couldn't be used; mapped to Hebrew in he.ts. */
export class DriveError extends Error {}

type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type Google = {
  accounts: {
    oauth2: {
      initTokenClient: (o: {
        client_id: string;
        scope: string;
        callback: (r: { access_token?: string }) => void;
        error_callback?: (e: { type?: string }) => void;
      }) => TokenClient;
      revoke: (token: string) => void;
    };
  };
  picker: PickerNamespace;
};
type PickerNamespace = {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: string) => DocsView;
  ViewId: { DOCS: string };
  Action: { PICKED: string; CANCEL: string };
  DocsViewMode: { LIST: string };
};
type DocsView = {
  setMimeTypes: (m: string) => DocsView;
  setIncludeFolders: (b: boolean) => DocsView;
  setMode: (m: string) => DocsView;
};
type PickerBuilder = {
  setOAuthToken: (t: string) => PickerBuilder;
  setDeveloperKey: (k: string) => PickerBuilder;
  setAppId: (id: string) => PickerBuilder;
  addView: (v: DocsView) => PickerBuilder;
  setLocale: (l: string) => PickerBuilder;
  setCallback: (cb: (d: PickerData) => void) => PickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
};
type PickerData = { action: string; docs?: { id: string; name: string; mimeType?: string }[] };

const win = () =>
  window as unknown as { google?: Google; gapi?: { load: (lib: string, cb: () => void) => void } };

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
          scripts.delete(src);
          reject(new DriveError("failed"));
        };
        document.head.appendChild(s);
      }),
    );
  }
  return scripts.get(src)!;
}

/** Google's consent popup for "files you pick with this app"; resolves with a token. */
export async function connectDrive(): Promise<string> {
  if (!driveImportReady) throw new DriveError("not_configured");
  await loadScript("https://accounts.google.com/gsi/client");
  const google = win().google!;
  return new Promise((resolve, reject) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: googleClientId,
        scope: SCOPE,
        callback: (r) =>
          r.access_token ? resolve(r.access_token) : reject(new DriveError("denied")),
        error_callback: (e) =>
          reject(new DriveError(e.type === "popup_closed" ? "popup_closed" : "denied")),
      })
      .requestAccessToken();
  });
}

export function disconnectDrive(token: string) {
  try {
    win().google?.accounts.oauth2.revoke(token);
  } catch {
    // It expires within the hour anyway.
  }
}

/** Downloads one picked file from Drive. */
export async function downloadDriveFile(token: string, id: string): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  } catch {
    throw new DriveError("failed");
  }
  if (!res.ok) throw new DriveError(res.status === 403 ? "denied" : "failed");
  return new Uint8Array(await res.arrayBuffer());
}

export const DOC_TYPES = {
  googleDoc: "application/vnd.google-apps.document",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Google's picker on the user's documents; resolves with the one picked, or null. */
export async function pickDocument(
  token: string,
): Promise<{ id: string; name: string; mimeType: string } | null> {
  await loadScript("https://apis.google.com/js/api.js");
  await new Promise<void>((resolve) => win().gapi!.load("picker", resolve));
  const { picker } = win().google!;
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setMimeTypes(
        [DOC_TYPES.googleDoc, DOC_TYPES.docx, "text/plain", "text/markdown", "text/html"].join(","),
      )
      .setIncludeFolders(false)
      .setMode(picker.DocsViewMode.LIST);
    new picker.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(googleApiKey)
      .setAppId(googleClientId.split("-")[0])
      .addView(view)
      .setLocale("iw")
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) {
          const doc = data.docs?.[0];
          resolve(doc ? { id: doc.id, name: doc.name, mimeType: doc.mimeType ?? "" } : null);
        } else if (data.action === picker.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}

/** A Google Doc as Markdown (headings kept), or plain text if Markdown isn't offered. */
export async function exportGoogleDoc(token: string, id: string): Promise<string> {
  for (const type of ["text/markdown", "text/plain"]) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(type)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).catch(() => null);
    if (res?.ok) return res.text();
    if (res?.status === 403 && type === "text/plain") throw new DriveError("denied");
  }
  throw new DriveError("failed");
}
