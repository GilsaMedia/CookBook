import { he } from "@/i18n/he";

/** "בקרוב": marks a feature that's shown but not built yet. */
export function SoonBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[0.625rem] leading-none font-bold text-accent ${className}`}
    >
      {he.common.soon}
    </span>
  );
}
