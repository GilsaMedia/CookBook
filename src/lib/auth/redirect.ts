/**
 * Only allow same-site relative paths as post-login destinations, so a
 * crafted `?next=` can't send someone to another site after signing in.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  const path = next.split(/[?#]/)[0];
  // The reset link signs in, then lands on the new-password page.
  if (isPublicPath(path) && path !== "/auth/reset") return "/";
  return next;
}

/** Pages a signed-out visitor may open: sign-in and the email-link pages. */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/auth/");
}
