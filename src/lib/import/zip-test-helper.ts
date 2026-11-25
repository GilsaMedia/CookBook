/** Builds a stored (uncompressed) ZIP in memory, for tests. */
export function makeZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const enc = new TextEncoder();
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (d: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of d) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const le = (n: number, bytes: number) => {
    const out = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) out[i] = (n >>> (8 * i)) & 0xff;
    return out;
  };
  const join = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === "string" ? enc.encode(content) : content;
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = join([
      le(0x04034b50, 4),
      le(20, 2),
      le(0x800, 2),
      le(0, 2),
      le(0, 4),
      le(crc, 4),
      le(data.length, 4),
      le(data.length, 4),
      le(nameBytes.length, 2),
      le(0, 2),
      nameBytes,
      data,
    ]);
    central.push(
      join([
        le(0x02014b50, 4),
        le(20, 2),
        le(20, 2),
        le(0x800, 2),
        le(0, 2),
        le(0, 4),
        le(crc, 4),
        le(data.length, 4),
        le(data.length, 4),
        le(nameBytes.length, 2),
        le(0, 2),
        le(0, 2),
        le(0, 2),
        le(0, 2),
        le(0, 4),
        le(offset, 4),
        nameBytes,
      ]),
    );
    chunks.push(local);
    offset += local.length;
  }
  const cd = join(central);
  const end = join([
    le(0x06054b50, 4),
    le(0, 2),
    le(0, 2),
    le(central.length, 2),
    le(central.length, 2),
    le(cd.length, 4),
    le(offset, 4),
    le(0, 2),
  ]);
  return join([...chunks, cd, end]);
}
