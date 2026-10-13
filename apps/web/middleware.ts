import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets, image files, the Stripe
    // webhook and the cron routes (no cookies — session refresh would be
    // wasted work).
    "/((?!_next/static|_next/image|favicon.ico|api/stripe|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
