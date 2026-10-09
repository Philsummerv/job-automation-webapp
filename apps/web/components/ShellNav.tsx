"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// App nav. On wide screens it's one row of links. On a phone it collapses to a
// "Menu" button that opens a full-width list, so nothing wraps into a mess of
// three ragged rows.

interface NavItem {
  href: string;
  label: string;
  /** Path prefixes that count as "this page" for highlighting. */
  match: string[];
}

export default function ShellNav({
  email,
  isAdmin,
}: {
  email: string | null;
  isAdmin: boolean;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  // Close the phone menu whenever the page changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const items: NavItem[] = [
    { href: "/dashboard", label: "Home", match: ["/dashboard"] },
    { href: "/resume", label: "Resume", match: ["/resume"] },
    { href: "/jobs", label: "Jobs", match: ["/jobs"] },
    { href: "/apply", label: "Apply kit", match: ["/apply"] },
    { href: "/dashboard#log", label: "Activity log", match: ["/log"] },
    // The Rules Assistant is still admin-only (it 404s for everyone else),
    // so only admins see the link.
    ...(isAdmin
      ? [{ href: "/assistant", label: "Rules help", match: ["/assistant"] }]
      : []),
    { href: "/settings", label: "Settings", match: ["/settings"] },
    { href: "/billing", label: "Billing", match: ["/billing"] },
    { href: "/feedback", label: "Feedback", match: ["/feedback"] },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", match: ["/admin"] }] : []),
  ];

  const isActive = (item: NavItem) =>
    item.match.some((m) => pathname === m || pathname.startsWith(m + "/"));

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <div className="flex items-center justify-between gap-4 py-3">
        <Link href="/dashboard" className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-lg font-bold text-brand">JobAssistUI</span>
          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
            Beta
          </span>
        </Link>

        <div className="flex items-center gap-3 text-sm">
          {email && (
            <span className="hidden max-w-[16rem] truncate text-slate-500 md:inline">
              {email}
            </span>
          )}
          <form action="/auth/signout" method="post" className="hidden lg:block">
            <button
              type="submit"
              className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="shell-mobile-nav"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50 lg:hidden"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {/* Wide screens: one row under the logo. */}
      <nav className="hidden flex-wrap items-center gap-x-5 gap-y-2 pb-3 text-sm lg:flex">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive(item)
                ? "font-medium text-brand"
                : "text-slate-600 hover:text-slate-900"
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Phones and small tablets: a simple list. */}
      {open && (
        <nav
          id="shell-mobile-nav"
          className="-mx-4 border-t border-slate-200 pb-3 sm:-mx-6 lg:hidden"
        >
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-3 text-base sm:px-6 ${
                    isActive(item)
                      ? "font-medium text-brand"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="px-4 pt-3 sm:px-6">
              {email && (
                <p className="mb-2 truncate text-sm text-slate-500">{email}</p>
              )}
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </form>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
