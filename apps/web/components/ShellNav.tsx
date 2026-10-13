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
    // Extras, not the main path. Last on purpose so it reads as optional.
    // Today it holds only the Indeed extension (/guided, /template).
    { href: "/more", label: "More tools", match: ["/more", "/guided", "/template"] },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", match: ["/admin"] }] : []),
  ];

  const isActive = (item: NavItem) =>
    item.match.some((m) => pathname === m || pathname.startsWith(m + "/"));

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <div className="flex items-center justify-between gap-4 py-3">
        <Link href="/dashboard" className="flex shrink-0 items-baseline gap-2 font-display text-brand">
          <span className="text-lg font-bold uppercase tracking-wide">JobAssistUI</span>
          <span className="font-mono text-[10px] text-slate-600">BETA</span>
        </Link>

        <div className="flex items-center gap-3 text-sm">
          {email && (
            <span className="hidden max-w-[16rem] truncate font-mono text-xs text-slate-600 md:inline">
              {email}
            </span>
          )}
          <form action="/auth/signout" method="post" className="hidden lg:block">
            <button
              type="submit"
              className="whitespace-nowrap border-[1.5px] border-brand px-3 py-1 font-display uppercase tracking-wide text-brand hover:bg-paper-field"
            >
              Sign out
            </button>
          </form>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="shell-mobile-nav"
            className="border-[1.5px] border-brand px-3 py-1 font-display uppercase tracking-wide text-brand hover:bg-paper-field lg:hidden"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {/* Wide screens: one row under the logo. */}
      <nav className="hidden flex-wrap items-center gap-x-6 gap-y-2 font-display text-sm uppercase tracking-wide lg:flex">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive(item)
                ? "-mb-0.5 border-b-[3px] border-brand pb-2 font-bold text-brand"
                : "pb-2.5 text-slate-600 hover:text-brand"
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
          className="-mx-4 border-t-[1.5px] border-brand pb-3 font-display uppercase tracking-wide sm:-mx-6 lg:hidden"
        >
          <ul className="divide-y divide-paper-line">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-3 text-base sm:px-6 ${
                    isActive(item)
                      ? "border-l-4 border-brand font-bold text-brand"
                      : "text-slate-700 hover:bg-paper-field"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="px-4 pt-3 sm:px-6">
              {email && (
                <p className="mb-2 truncate font-mono text-sm normal-case tracking-normal text-slate-600">{email}</p>
              )}
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="w-full border-[1.5px] border-brand px-3 py-2 uppercase tracking-wide text-brand hover:bg-paper-field"
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
