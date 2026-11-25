/**
 * Which book the app shows. A user can own several books and be a member
 * of others'; the choice is remembered on this device. Without one (or if
 * it's gone), the first book they own, else the first they're in.
 */
const KEY = "cookbook.book";

export function selectedBookId(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function selectBook(id: string) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Private mode: the default book it is.
  }
}

export function pickMembership<T extends { book_id: string; role: string }>(
  rows: T[],
): T | undefined {
  const chosen = selectedBookId();
  return rows.find((r) => r.book_id === chosen) ?? rows.find((r) => r.role === "owner") ?? rows[0];
}
