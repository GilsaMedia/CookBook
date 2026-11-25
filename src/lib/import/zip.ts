/**
 * A minimal ZIP reader for the browser (and Node 18+): enough for .docx
 * files and Google Takeout archives. Reads the central directory and
 * inflates entries with the platform's DecompressionStream, so it needs
 * no dependency. Stored (0) and deflated (8) entries only; no encryption,
 * no ZIP64.
 */

export type ZipEntry = { name: string; size: number; read: () => Promise<Uint8Array> };

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class ZipError extends Error {}

/** Lists a ZIP's files. Throws ZipError when the bytes aren't a ZIP. */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  // End of central directory: signature 0x06054b50, within the last 64 KB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("not a zip");
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (u32(bytes, p) !== 0x02014b50) throw new ZipError("bad central directory");
    const method = u16(bytes, p + 10);
    const compressed = u32(bytes, p + 20);
    const size = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    entries.push({
      name,
      size,
      read: async () => {
        if (u32(bytes, local) !== 0x04034b50) throw new ZipError("bad local header");
        const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
        const data = bytes.subarray(start, start + compressed);
        if (method === 0) return data;
        if (method === 8) return inflateRaw(data);
        throw new ZipError(`unsupported compression ${method}`);
      },
    });
  }
  return entries;
}

export const readText = async (entry: ZipEntry) =>
  new TextDecoder("utf-8").decode(await entry.read());
