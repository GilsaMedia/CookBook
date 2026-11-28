import type { RecipeIngredient } from "@/lib/recipes/types";

/** What a cook screen shows: the step it's on and what's in the pot. */
export type CookSnapshot = { step: number; checked: string[] };

/** The stored session fields the sync needs. */
export type CookRevision = {
  rev: number;
  current_step: number;
  checked_ingredient_ids: string[];
};

/** The step to show: a recipe edited since may have fewer steps. */
export const clampStep = (step: number, count: number) =>
  Math.max(0, Math.min(step, Math.max(0, count - 1)));

/**
 * Ingredients for the panel, unchecked first (in recipe order), then the
 * checked ones, which sink. Checks of ingredients deleted since don't count.
 */
export function cookProgress(ingredients: RecipeIngredient[], checked: string[]) {
  const done = new Set(checked);
  const open = ingredients.filter((i) => !done.has(i.id));
  const closed = ingredients.filter((i) => done.has(i.id));
  return {
    ordered: [...open, ...closed],
    done: closed.length,
    total: ingredients.length,
    next: open[0] ?? null,
    allDone: ingredients.length > 0 && open.length === 0,
  };
}

/**
 * Keeps one screen in step with the stored session while the cook taps
 * away. The screen shows its own taps at once and sends them one at a time,
 * in order. While any are on their way, rows heard from other screens are
 * held back (they'd briefly undo a tap that hasn't landed yet); once the
 * last one lands, the screen takes the newest stored state. Older revisions
 * never replace newer ones.
 */
export class CookSync {
  private rev = -1;
  private pending = 0;
  private stale = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly opts: {
      show: (snapshot: CookSnapshot) => void;
      refetch: () => Promise<CookRevision | null>;
      onError: () => void;
    },
  ) {}

  /** Starts from a stored row, whatever revision it is (a session started or restarted). */
  reset(row: CookRevision) {
    this.rev = row.rev;
    this.show(row);
  }

  /** A row from another screen (Realtime). */
  receive(row: CookRevision) {
    if (this.pending > 0) {
      this.stale = true;
      return;
    }
    this.accept(row);
  }

  /** Sends one change; `op` resolves with the stored row after it. */
  send(op: () => Promise<CookRevision | null>): Promise<void> {
    this.pending++;
    this.queue = this.queue.then(() =>
      op().then(
        (row) => this.settle(row),
        () => {
          this.opts.onError();
          this.stale = true;
          return this.settle(null);
        },
      ),
    );
    return this.queue;
  }

  private async settle(row: CookRevision | null) {
    this.pending--;
    if (this.pending > 0) return;
    if (row && !this.stale) return this.accept(row);
    // Something was held back, or a change failed: show what's stored.
    this.stale = false;
    const fresh = await this.opts.refetch().catch(() => null);
    if (fresh && this.pending === 0) this.accept(fresh);
  }

  private accept(row: CookRevision) {
    if (row.rev < this.rev) return;
    this.rev = row.rev;
    this.show(row);
  }

  private show(row: CookRevision) {
    this.opts.show({ step: row.current_step, checked: row.checked_ingredient_ids });
  }
}
