/* eslint-disable @next/next/no-img-element -- signed Supabase URLs, not optimizable assets */

const PLACEHOLDER_TONES = [
  "bg-[#f1e4d6]",
  "bg-[#e9ecdc]",
  "bg-[#f4dfd8]",
  "bg-[#e6e3ef]",
  "bg-[#f3ead0]",
];

function tone(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PLACEHOLDER_TONES[Math.abs(hash) % PLACEHOLDER_TONES.length];
}

/**
 * A recipe photo, or a soft placeholder with a pot when there is none.
 * The photo is decorative next to the title, so alt text is empty.
 */
export function RecipeImage({
  id,
  url,
  className = "",
}: {
  id: string;
  url: string | null;
  className?: string;
}) {
  if (url) {
    return <img src={url} alt="" loading="lazy" className={`object-cover ${className}`} />;
  }
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center text-ink/25 ${tone(id)} ${className}`}
    >
      <svg
        width="40%"
        height="40%"
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 20h32v12a8 8 0 0 1-8 8H16a8 8 0 0 1-8-8z" />
        <path d="M4 20h40M18 14c0-3 2-3 2-6M26 14c0-3 2-3 2-6" />
      </svg>
    </div>
  );
}
