import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

// Refreshes the auth session on every request and mirrors cookies onto the
// response so Server Components see a fresh session. Also gates the app routes:
// unauthenticated users hitting an app route are redirected to /login.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Before Supabase is configured, skip session handling so the public site
  // (landing/login) still boots. App routes will simply have no session.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as never),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // Segment-exact prefixes: "/log".startsWith would also capture "/login".
  // Signed-out visitors hitting these get bounced to /login with ?redirect=,
  // so they land back where they were headed after signing in. That matters
  // most for /guided and /template, which are linked from the public landing
  // page — without it, someone clicking "Get the Chrome extension" signs in
  // and arrives on the dashboard wondering what happened.
  //
  // /assistant is deliberately NOT here: it gates with notFound() so a
  // non-admin learns nothing about it existing, and a login bounce would leak
  // that it does.
  const isAppRoute = [
    "/dashboard",
    "/log",
    "/settings",
    "/export",
    "/billing",
    "/admin",
    "/guided",
    "/template",
    "/feedback",
  ].some(
    (p) => path === p || path.startsWith(`${p}/`),
  );

  if (!user && isAppRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  return response;
}
