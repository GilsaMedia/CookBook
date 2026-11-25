import type { ImageFiles } from "@/lib/data/imports";
import type { ParsedCollection } from "./types";
import { readZip, type ZipEntry } from "./zip";

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

/** The Keep photos a collection refers to, read from its ZIP file(s). */
export async function readImagesFrom(
  zipFiles: ZipEntry[],
  parsed: ParsedCollection,
): Promise<ImageFiles> {
  const wanted = new Set(parsed.entries.flatMap((e) => e.images));
  const files: ImageFiles = new Map();
  if (!wanted.size) return files;
  for (const entry of zipFiles) {
    if (!wanted.has(entry.name)) continue;
    const type = IMAGE_TYPES[entry.name.split(".").pop()?.toLowerCase() ?? ""];
    if (type) files.set(entry.name, { bytes: await entry.read(), type });
  }
  return files;
}

export async function readImages(bytes: Uint8Array, parsed: ParsedCollection): Promise<ImageFiles> {
  if (!parsed.entries.some((e) => e.images.length)) return new Map();
  return readImagesFrom(readZip(bytes), parsed);
}
