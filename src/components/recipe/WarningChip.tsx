import { he } from "@/i18n/he";

/** Names the excluded ingredients a recipe contains (PRD §10). Never hides the recipe. */
export function WarningChip({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
      <span aria-hidden="true">⚠</span>
      {he.warnings.contains(names)}
    </span>
  );
}
