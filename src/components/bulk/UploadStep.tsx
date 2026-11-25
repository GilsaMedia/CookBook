"use client";

import { useState } from "react";
import { he } from "@/i18n/he";
import type { ImageFiles } from "@/lib/data/imports";
import { parseCollection, ParseError } from "@/lib/import/parse";
import type { ParsedCollection } from "@/lib/import/types";
import { readZip } from "@/lib/import/zip";

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

/** Reads the Keep attachments a collection refers to, for upload after saving. */
export async function readImages(bytes: Uint8Array, parsed: ParsedCollection): Promise<ImageFiles> {
  const wanted = new Set(parsed.entries.flatMap((e) => e.images));
  const files: ImageFiles = new Map();
  if (!wanted.size) return files;
  for (const entry of readZip(bytes)) {
    if (!wanted.has(entry.name)) continue;
    const type = IMAGE_TYPES[entry.name.split(".").pop()?.toLowerCase() ?? ""];
    if (type) files.set(entry.name, { bytes: await entry.read(), type });
  }
  return files;
}

/** Step 1: pick a .docx or a Keep Takeout ZIP; it's read right here in the browser. */
export function UploadStep({
  onParsed,
}: {
  onParsed: (fileName: string, parsed: ParsedCollection, images: ImageFiles) => void;
}) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();

  async function read(file: File) {
    setReading(true);
    setError(undefined);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = await parseCollection(file.name, bytes);
      onParsed(file.name, parsed, await readImages(bytes, parsed));
    } catch (e) {
      const code = e instanceof ParseError ? e.message : "unreadable";
      setError(he.bulk.errors[code] ?? he.bulk.errors.default);
      setReading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{he.bulk.intro}</p>
      <label className="press flex h-12 cursor-pointer items-center justify-center rounded-full bg-accent text-base font-semibold text-white">
        {reading ? he.bulk.reading : he.bulk.choose}
        <input
          type="file"
          accept=".docx,.zip,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip"
          className="sr-only"
          disabled={reading}
          onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
