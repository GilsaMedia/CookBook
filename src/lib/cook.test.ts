import { describe, expect, it, vi } from "vitest";
import { clampStep, cookProgress, CookSync, type CookRevision } from "./cook";

const ing = (id: string) => ({ id, displayText: id, optional: false });
const row = (rev: number, step: number, checked: string[] = []): CookRevision => ({
  rev,
  current_step: step,
  checked_ingredient_ids: checked,
});

/** A promise and the function that resolves it, to land a change on cue. */
function later<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("cookProgress", () => {
  it("lists unchecked first, in order, and counts only ingredients that still exist", () => {
    const p = cookProgress([ing("a"), ing("b"), ing("c")], ["b", "gone"]);
    expect(p.ordered.map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(p).toMatchObject({ done: 1, total: 3, allDone: false });
    expect(p.next?.id).toBe("a");
  });

  it("is all done only when every ingredient is checked", () => {
    expect(cookProgress([ing("a")], ["a"]).allDone).toBe(true);
    expect(cookProgress([ing("a")], ["a"]).next).toBeNull();
    expect(cookProgress([], []).allDone).toBe(false);
  });
});

describe("clampStep", () => {
  it("stays inside the recipe's steps", () => {
    expect(clampStep(5, 3)).toBe(2);
    expect(clampStep(-1, 3)).toBe(0);
    expect(clampStep(2, 0)).toBe(0);
  });
});

describe("CookSync", () => {
  const setup = (stored: CookRevision | null = null) => {
    const show = vi.fn();
    const refetch = vi.fn(async () => stored);
    const onError = vi.fn();
    const sync = new CookSync({ show, refetch, onError });
    return { sync, show, refetch, onError };
  };

  it("shows rows from other screens, but never an older one", () => {
    const { sync, show } = setup();
    sync.reset(row(3, 1));
    sync.receive(row(5, 2));
    sync.receive(row(4, 9));
    expect(show.mock.calls.map((c) => c[0].step)).toEqual([1, 2]);
  });

  it("holds other screens' rows while its own taps are on the way, then shows the stored state", async () => {
    const stored = row(7, 0, ["a", "b"]);
    const { sync, show, refetch } = setup(stored);
    sync.reset(row(1, 0));
    const tap = later<CookRevision>();
    const sent = sync.send(() => tap.promise);
    // The other screen's check arrives before ours lands: not shown yet.
    sync.receive(row(2, 0, ["b"]));
    expect(show).toHaveBeenCalledTimes(1);
    tap.resolve(row(3, 0, ["a"]));
    await sent;
    expect(refetch).toHaveBeenCalled();
    expect(show).toHaveBeenLastCalledWith({ step: 0, checked: ["a", "b"] });
  });

  it("sends taps one at a time, in order, and shows the last one's row", async () => {
    const { sync, show } = setup();
    sync.reset(row(0, 0));
    const order: string[] = [];
    const first = later<CookRevision>();
    sync.send(() => {
      order.push("a");
      return first.promise;
    });
    const done = sync.send(async () => {
      order.push("b");
      return row(2, 0, ["a", "b"]);
    });
    expect(order).toEqual([]);
    await Promise.resolve();
    expect(order).toEqual(["a"]);
    first.resolve(row(1, 0, ["a"]));
    await done;
    expect(order).toEqual(["a", "b"]);
    // Only the last row is shown: the first would undo the second tap.
    expect(show.mock.calls.map((c) => c[0].checked)).toEqual([[], ["a", "b"]]);
  });

  it("says when a change failed and puts back what's stored", async () => {
    const { sync, show, onError } = setup(row(4, 1));
    sync.reset(row(4, 1));
    await sync.send(() => Promise.reject(new Error("offline")));
    expect(onError).toHaveBeenCalledOnce();
    expect(show).toHaveBeenLastCalledWith({ step: 1, checked: [] });
  });
});
