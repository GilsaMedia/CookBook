// Links whose recipe lives in a video. The AI server downloads these
// (ai-server/video.py has the same list) and reads speech and frames.
// The app keeps a copy in src/lib/ai/video-sites.ts for its loading message.

export const VIDEO_SITES: Record<string, string> = {
  "tiktok.com": "TikTok",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "instagram.com": "Instagram",
};

/** The video site's display name, or null if the link isn't a video page. */
export function videoSite(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || (url.port && url.port !== "443")) return null;
  const host = url.hostname.toLowerCase();
  for (const [domain, name] of Object.entries(VIDEO_SITES)) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return null;
}
