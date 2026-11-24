import { he } from "@/i18n/he";

/** "45 דק׳" or "1 ש׳ 15 דק׳". */
export function formatMinutes(total: number): string {
  if (total < 60) return he.time.minutes(total);
  return he.time.hours(Math.floor(total / 60), total % 60);
}

/** The card's meta line: "category · time", skipping whatever is unknown. */
export function cardMeta(categoryName: string | null, totalMinutes: number | null): string {
  return [categoryName, totalMinutes ? formatMinutes(totalMinutes) : null]
    .filter(Boolean)
    .join(" · ");
}
