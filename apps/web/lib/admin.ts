import { notFound } from "next/navigation";
import { getProfileContext } from "@/lib/auth";

// Who may see the admin dashboard. Comma-separated emails in ADMIN_EMAILS,
// case-insensitive. Deliberately NOT reusing COMPED_EMAILS: that list is for
// comped beta testers, who must never see every user's email address.
export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

// Gate for the admin dashboard. notFound() rather than redirect: a non-admin
// gets a plain 404 and learns nothing about the page existing.
export async function requireAdmin() {
  const ctx = await getProfileContext();
  if (!isAdminEmail(ctx.user.email)) notFound();
  return ctx;
}
