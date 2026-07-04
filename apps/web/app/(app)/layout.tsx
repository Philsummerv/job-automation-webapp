import Link from "next/link";
import { requireUser } from "@/lib/auth";

// Authenticated app shell: top nav + sign-out. Middleware already blocks
// unauthenticated access to these routes; requireUser is a belt-and-suspenders.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold text-brand">
              ApplyAssistUI
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">
                Activity Log
              </Link>
              <Link href="/log/new" className="text-slate-600 hover:text-slate-900">
                Add Activity
              </Link>
              <Link href="/settings" className="text-slate-600 hover:text-slate-900">
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
