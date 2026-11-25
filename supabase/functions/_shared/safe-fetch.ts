// Fetches a user-supplied URL without letting it reach private networks
// (SSRF): http(s) on ports 80/443 only, no private, loopback, link-local or
// metadata addresses (checked by name, as an IP literal, and after DNS when
// the runtime can resolve), every redirect re-checked, a size cap and a
// timeout. The address checks are pure so Vitest can cover them.

export class FetchBlocked extends Error {}

const BLOCKED_NAMES =
  /(^|\.)(localhost|local|internal|localdomain|home|lan|intranet|corp|ts\.net)$/i;

function ipv4Parts(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

/** True for addresses that must never be fetched on a user's behalf. */
export function isPrivateAddress(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = ipv4Parts(host);
  if (v4) {
    const [a, b] = v4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT, Tailscale
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (host.includes(":")) {
    if (host === "::" || host === "::1") return true;
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(host);
  }
  return false;
}

/** Returns an error code for a URL that may not be fetched, or null if it may. */
export function checkUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "bad_url";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "bad_url";
  if (url.username || url.password) return "bad_url";
  if (url.port && url.port !== "80" && url.port !== "443") return "blocked_url";
  const host = url.hostname.replace(/\.$/, "");
  if (!host.includes(".") && !host.includes(":")) return "blocked_url";
  if (BLOCKED_NAMES.test(host) || isPrivateAddress(host)) return "blocked_url";
  return null;
}

type Resolver = (host: string) => Promise<string[]>;

/** Deno's DNS lookup when available (Edge Functions); otherwise none. */
const denoResolver: Resolver | null = (() => {
  const deno = (
    globalThis as { Deno?: { resolveDns?: (h: string, t: string) => Promise<string[]> } }
  ).Deno;
  if (!deno?.resolveDns) return null;
  return async (host) => {
    const results = await Promise.allSettled([
      deno.resolveDns!(host, "A"),
      deno.resolveDns!(host, "AAAA"),
    ]);
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  };
})();

async function assertPublic(raw: string, resolve: Resolver | null) {
  const problem = checkUrl(raw);
  if (problem) throw new FetchBlocked(problem);
  const host = new URL(raw).hostname;
  if (resolve && !ipv4Parts(host) && !host.includes(":")) {
    const addresses = await resolve(host);
    if (addresses.some(isPrivateAddress)) throw new FetchBlocked("blocked_url");
  }
}

export type SafeResponse = { url: string; contentType: string; body: Uint8Array };

/**
 * GETs a public URL, following up to 3 redirects, each checked again.
 * Throws FetchBlocked with a code: bad_url, blocked_url, too_large,
 * fetch_failed or wrong_type.
 */
export async function safeFetch(
  raw: string,
  {
    maxBytes,
    timeoutMs = 10_000,
    accept,
    resolve = denoResolver,
  }: { maxBytes: number; timeoutMs?: number; accept: RegExp; resolve?: Resolver | null },
): Promise<SafeResponse> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = raw;
  for (let hop = 0; hop <= 3; hop++) {
    await assertPublic(url, resolve);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; FamilyCookbook/1.0; recipe import)",
          accept: "text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5",
        },
      });
    } catch {
      throw new FetchBlocked("fetch_failed");
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      await res.body?.cancel();
      if (!next) throw new FetchBlocked("fetch_failed");
      url = new URL(next, url).toString();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new FetchBlocked("fetch_failed");
    }
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!accept.test(contentType)) {
      await res.body?.cancel();
      throw new FetchBlocked("wrong_type");
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) {
      await res.body?.cancel();
      throw new FetchBlocked("too_large");
    }
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new FetchBlocked("too_large");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      body.set(c, offset);
      offset += c.length;
    }
    return { url, contentType, body };
  }
  throw new FetchBlocked("fetch_failed");
}

/** Decodes an HTML body using its declared charset (default UTF-8). */
export function decodeHtml(res: SafeResponse): string {
  const fromHeader = res.contentType.match(/charset=([\w-]+)/i)?.[1];
  const head = new TextDecoder("latin1").decode(res.body.subarray(0, 2048));
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(fromHeader ?? fromMeta ?? "utf-8").decode(res.body);
  } catch {
    return new TextDecoder("utf-8").decode(res.body);
  }
}
