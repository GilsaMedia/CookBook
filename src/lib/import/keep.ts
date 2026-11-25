import type { ImportEntry } from "./types";
import type { ZipEntry } from "./zip";
import { readText } from "./zip";

type KeepNote = {
  title?: string;
  textContent?: string;
  listContent?: { text?: string; isChecked?: boolean }[];
  labels?: { name?: string }[];
  attachments?: { filePath?: string; mimetype?: string }[];
  annotations?: { url?: string; title?: string; source?: string }[];
  createdTimestampUsec?: number;
  isTrashed?: boolean;
};

const URL_ONLY = /^\s*(https?:\/\/\S+)\s*$/i;

/** True for a ZIP that looks like a Google Takeout export of Keep. */
export const isKeepTakeout = (entries: ZipEntry[]) =>
  entries.some((e) => /(^|\/)Keep\/[^/]+\.json$/i.test(e.name));

/**
 * One entry per Keep note (PRD §7.3): labels kept, image attachments located
 * in the ZIP, the creation date preserved. Trashed notes are skipped; a note
 * that is only a link becomes a link entry.
 */
export async function readKeep(entries: ZipEntry[]): Promise<ImportEntry[]> {
  const byName = new Map(entries.map((e) => [e.name, e]));
  const notes = entries
    .filter((e) => /(^|\/)Keep\/[^/]+\.json$/i.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const out: ImportEntry[] = [];
  for (const file of notes) {
    let note: KeepNote;
    try {
      note = JSON.parse(await readText(file));
    } catch {
      continue;
    }
    if (note.isTrashed) continue;
    const folder = file.name.slice(0, file.name.lastIndexOf("/") + 1);
    const body = [
      note.textContent?.trim() ?? "",
      ...(note.listContent ?? []).map((i) => (i.text?.trim() ? `- ${i.text.trim()}` : "")),
    ]
      .filter(Boolean)
      .join("\n");
    const link =
      body.match(URL_ONLY)?.[1] ??
      (!body ? (note.annotations?.find((a) => a.url)?.url ?? null) : null);
    const title = note.title?.trim() || note.annotations?.find((a) => a.title)?.title || "";
    const labels = (note.labels ?? []).map((l) => l.name?.trim() ?? "").filter(Boolean);
    const images = (note.attachments ?? [])
      .filter((a) => a.filePath && /^image\//.test(a.mimetype ?? "image/"))
      .map((a) => folder + a.filePath!)
      .filter((name) => byName.has(name));
    const kind: ImportEntry["kind"] = link ? "link" : body ? "recipe" : "empty";
    out.push({
      key: file.name.slice(folder.length),
      title: title || (link ?? "") || file.name.slice(folder.length, -5),
      group: labels[0] ?? null,
      labels,
      kind,
      text: kind === "recipe" ? [title && `Title: ${title}`, body].filter(Boolean).join("\n") : "",
      sourceUrl: link,
      sourceName: link ? new URL(link).hostname.replace(/^www\./, "") : null,
      createdAt: note.createdTimestampUsec
        ? new Date(note.createdTimestampUsec / 1000).toISOString()
        : null,
      images,
    });
  }
  return out;
}
