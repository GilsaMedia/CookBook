import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseEnv } from "@/lib/supabase/env";

const isPublic = (path: string) => path === "/login" || path.startsWith("/auth/");

/**
 * Refreshes the Supabase session cookie on every request and keeps signed-out
 * visitors on /login. Authorization itself is enforced by RLS in the database.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [header, value] of Object.entries(headers ?? {})) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // Verifies the JWT and refreshes it if needed. Don't put code between
  // createServerClient and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!signedIn && !isPublic(pathname)) {
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (signedIn && pathname === "/login") {
    return redirectTo("/");
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, the manifest and the service worker.
    "/((?!_next/static|_next/image|serwist/|icons/|favicon\\.ico|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)",
  ],
};
