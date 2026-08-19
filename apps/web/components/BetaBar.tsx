"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "jaui.betaBarDismissed";

// In-app beta notice. Dismissible (unlike FreePeriodBanner, which is a pricing
// disclosure and must always show) — its job is to set expectations once and
// keep a report-a-bug link one click away from every screen. Mounted in the
// authenticated shell only; the landing page carries its own "Beta" badge.
export default function BetaBar() {
  const pathname = usePathname();
  // Render nothing on the first client pass so the server HTML matches; the
  // effect below then decides based on localStorage.
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(window.localStorage.getItem(STORAGE_KEY) !== "1");
  }, []);

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  }

  if (!show || pathname === "/feedback") return null;

  return (
    <div className="border-b border-sky-200 bg-sky-50">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-2 text-sm text-sky-900">
        <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          Beta
        </span>
        <span className="flex-1">
          You&apos;re an early user — thank you. If anything breaks or reads
          wrong,{" "}
          <Link
            href={`/feedback?from=${encodeURIComponent(pathname)}`}
            className="font-medium underline"
          >
            tell me about it
          </Link>
          .
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss beta notice"
          className="shrink-0 rounded px-2 py-0.5 text-sky-700 hover:bg-sky-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
