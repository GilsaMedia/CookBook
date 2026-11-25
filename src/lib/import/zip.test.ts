import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readText, readZip, ZipError } from "./zip";
import { makeZip } from "./zip-test-helper";

describe("readZip", () => {
  it("reads stored entries with Hebrew names", async () => {
    const entries = readZip(makeZip({ "Keep/מרק.json": '{"title":"מרק"}', "a/b.txt": "hi" }));
    expect(entries.map((e) => e.name)).toEqual(["Keep/מרק.json", "a/b.txt"]);
    expect(await readText(entries[0])).toBe('{"title":"מרק"}');
  });

  it("inflates deflated entries", async () => {
    const text = "עוגה ".repeat(200);
    const zip = makeZip({ "x.txt": "placeholder" });
    // Swap in a deflated body: patch method and sizes in both headers.
    const deflated = new Uint8Array(deflateRawSync(Buffer.from(text)));
    const entries = readZip(zip);
    expect(entries).toHaveLength(1);
    const built = makeDeflatedZip("x.txt", deflated, Buffer.byteLength(text));
    expect(await readText(readZip(built)[0])).toBe(text);
  });

  it("rejects non-zip bytes", () => {
    expect(() => readZip(new TextEncoder().encode("not a zip at all, just text"))).toThrow(
      ZipError,
    );
  });
});

/** One deflated entry (method 8), CRC left as 0: readZip doesn't check it. */
function makeDeflatedZip(name: string, data: Uint8Array, size: number) {
  const le = (n: number, b: number) =>
    Uint8Array.from({ length: b }, (_, i) => (n >>> (8 * i)) & 0xff);
  const nameBytes = new TextEncoder().encode(name);
  const parts = (...p: Uint8Array[]) => {
    const out = new Uint8Array(p.reduce((s, x) => s + x.length, 0));
    let o = 0;
    for (const x of p) {
      out.set(x, o);
      o += x.length;
    }
    return out;
  };
  const local = parts(
    le(0x04034b50, 4),
    le(20, 2),
    le(0, 2),
    le(8, 2),
    le(0, 4),
    le(0, 4),
    le(data.length, 4),
    le(size, 4),
    le(nameBytes.length, 2),
    le(0, 2),
    nameBytes,
    data,
  );
  const central = parts(
    le(0x02014b50, 4),
    le(20, 2),
    le(20, 2),
    le(0, 2),
    le(8, 2),
    le(0, 4),
    le(0, 4),
    le(data.length, 4),
    le(size, 4),
    le(nameBytes.length, 2),
    le(0, 2),
    le(0, 2),
    le(0, 2),
    le(0, 2),
    le(0, 4),
    le(0, 4),
    nameBytes,
  );
  const end = parts(
    le(0x06054b50, 4),
    le(0, 2),
    le(0, 2),
    le(1, 2),
    le(1, 2),
    le(central.length, 4),
    le(local.length, 4),
    le(0, 2),
  );
  return parts(local, central, end);
}
