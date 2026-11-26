/**
 * Meal titles and dates in Hebrew (PRD §8.2): "ארוחת שישי · 14.11".
 * Dates are calendar days ("2026-11-27"), handled in local time.
 */

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "שישי" */
export const weekday = (iso: string) => WEEKDAYS[parse(iso).getDay()];

/** "ארוחת שישי": the title a meal gets from its date. */
export const defaultTitle = (iso: string) => `ארוחת ${weekday(iso)}`;

/** "14.11" */
export const shortDate = (iso: string) => {
  const d = parse(iso);
  return `${d.getDate()}.${d.getMonth() + 1}`;
};

/** "ארוחת שישי · 14.11"; without a date, just the title. */
export const mealLabel = (title: string, iso: string | null) =>
  [title.trim() || (iso ? defaultTitle(iso) : ""), iso ? shortDate(iso) : ""]
    .filter(Boolean)
    .join(" · ");

/** The coming Friday (today, if it's Friday): most family meals are Friday dinner. */
export function nextFriday(today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  return toIsoDate(d);
}

/** "27.11.2026", from a date or a timestamp. */
export const fullDate = (iso: string) => {
  const d = iso.length === 10 ? parse(iso) : new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
};
