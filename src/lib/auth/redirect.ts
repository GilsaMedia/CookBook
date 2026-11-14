/**
 * Only allow same-site relative paths as post-login destinations, so a
 * crafted `?next=` can't send someone to another site after signing in.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/auth/")) return "/";
  return next;
}
