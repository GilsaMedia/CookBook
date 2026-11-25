/**
 * Keep without files: Google Takeout delivers the Keep export to the user's
 * own Google Drive ("Add to Drive"), and Google's file picker hands this app
 * just that file. The Keep API itself refuses personal Gmail accounts.
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

// Takeout with only Keep selected.
export const TAKEOUT_KEEP = "https://takeout.google.com/settings/takeout/custom/keep";

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
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string; CANCEL: string };
  DocsViewMode: { LIST: string };
};
type DocsView = {
  setQuery: (q: string) => DocsView;
  setMimeTypes: (m: string) => DocsView;
  setIncludeFolders: (b: boolean) => DocsView;
  setMode: (m: string) => DocsView;
};
type PickerBuilder = {
  setOAuthToken: (t: string) => PickerBuilder;
  setDeveloperKey: (k: string) => PickerBuilder;
  setAppId: (id: string) => PickerBuilder;
  addView: (v: DocsView) => PickerBuilder;
  enableFeature: (f: string) => PickerBuilder;
  setLocale: (l: string) => PickerBuilder;
  setTitle: (t: string) => PickerBuilder;
  setCallback: (cb: (d: PickerData) => void) => PickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
};
type PickerData = { action: string; docs?: { id: string; name: string }[] };

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

/**
 * Opens Google's file picker on the user's Takeout ZIPs (newest first) and
 * resolves with the picked files, or [] if they closed it. Takeout splits
 * big exports into parts, so several files may be picked.
 */
export async function pickTakeoutFiles(token: string): Promise<{ id: string; name: string }[]> {
  await loadScript("https://apis.google.com/js/api.js");
  await new Promise<void>((resolve) => win().gapi!.load("picker", resolve));
  const { picker } = win().google!;
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setQuery("takeout")
      .setMimeTypes("application/zip,application/x-zip-compressed,application/x-zip")
      .setIncludeFolders(false)
      .setMode(picker.DocsViewMode.LIST);
    new picker.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(googleApiKey)
      .setAppId(googleClientId.split("-")[0])
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setLocale("iw")
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs ?? []);
        else if (data.action === picker.Action.CANCEL) resolve([]);
      })
      .build()
      .setVisible(true);
  });
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
