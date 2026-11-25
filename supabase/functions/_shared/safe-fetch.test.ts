import { describe, expect, it } from "vitest";
import { checkUrl, FetchBlocked, isPrivateAddress, safeFetch } from "./safe-fetch";
import { videoSite } from "./video-sites";

describe("checkUrl", () => {
  it.each([
    ["https://www.example.com/recipe", null],
    ["http://example.co.il/a?b=1", null],
    ["ftp://example.com/x", "bad_url"],
    ["javascript:alert(1)", "bad_url"],
    ["https://user:pw@example.com/", "bad_url"],
    ["not a url", "bad_url"],
    ["http://localhost:3000/", "blocked_url"],
    ["http://127.0.0.1/", "blocked_url"],
    ["http://10.0.0.74/", "blocked_url"],
    ["http://169.254.169.254/latest/meta-data/", "blocked_url"],
    ["http://[::1]/", "blocked_url"],
    ["http://intranet/", "blocked_url"],
    ["https://gilsa.tail016c50.ts.net:10000/", "blocked_url"],
    ["https://printer.local/", "blocked_url"],
    ["https://example.com:8080/", "blocked_url"],
  ])("%s → %s", (url, expected) => {
    expect(checkUrl(url)).toBe(expected);
  });
});

describe("isPrivateAddress", () => {
  it.each([
    ["100.76.185.87", true], // Tailscale
    ["172.20.1.1", true],
    ["192.168.1.10", true],
    ["::ffff:10.1.2.3", true],
    ["fd7a:115c:a1e0::1", true],
    ["fe80::1", true],
    ["8.8.8.8", false],
    ["2606:4700::1111", false],
  ])("%s → %s", (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });
});

describe("safeFetch", () => {
  it("refuses a public name that resolves to a private address", async () => {
    await expect(
      safeFetch("https://rebind.example.com/", {
        maxBytes: 1000,
        accept: /text\/html/,
        resolve: async () => ["10.0.0.5"],
      }),
    ).rejects.toThrow(FetchBlocked);
  });
});

describe("videoSite", () => {
  it.each([
    ["https://vt.tiktok.com/ZSsjqucnh/", "TikTok"],
    ["https://www.tiktok.com/@a/video/1", "TikTok"],
    ["https://youtu.be/abc", "YouTube"],
    ["https://www.youtube.com/shorts/abc", "YouTube"],
    ["https://www.instagram.com/reel/abc/", "Instagram"],
    ["http://www.tiktok.com/@a/video/1", null],
    ["https://tiktok.com.evil.example/x", null],
    ["https://www.bbcgoodfood.com/recipes/x", null],
  ])("%s → %s", (url, expected) => {
    expect(videoSite(url)).toBe(expected);
  });
});
