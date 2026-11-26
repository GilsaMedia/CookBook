/**
 * Meal titles and dates in Hebrew, the way the family writes them:
 * "יום שישי 27/11/2026". Dates are calendar days ("2026-11-27"), handled in
 * local time.
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

/** "יום שישי": the title a meal gets from its date. */
export const defaultTitle = (iso: string) => `יום ${weekday(iso)}`;

/** "14.11" */
export const shortDate = (iso: string) => {
  const d = parse(iso);
  return `${d.getDate()}.${d.getMonth() + 1}`;
};

/** "27/11/2026" */
export const slashDate = (iso: string) => {
  const d = parse(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

/** "יום שישי 27/11/2026"; without a date, just the title. */
export const mealLabel = (title: string, iso: string | null) =>
  [title.trim() || (iso ? defaultTitle(iso) : ""), iso ? slashDate(iso) : ""]
    .filter(Boolean)
    .join(" ");

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
