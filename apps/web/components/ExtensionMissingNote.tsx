"use client";

import Link from "next/link";
import { useExtensionInstalled } from "@/components/useExtensionInstalled";

// A standing "you don't have the extension yet" note, for pages that describe
// autofill as though it already works.
//
// The Answer Template page needs this on every visit, not only the moment after
// a save: the "what to do next" card renders on ?saved=1, so anyone returning
// to edit their answers saw a page promising autofill with no way to get it.
//
// Renders nothing when the extension is installed, and nothing while detection
// is still pending — an install prompt that flashes at someone who already
// installed it is worse than no prompt at all.
export function ExtensionMissingNote({ className = "" }: { className?: string }) {
  const installed = useExtensionInstalled();
  if (installed !== false) return null;

  return (
    <div
      className={`rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 ${className}`}
    >
      <p>
        <strong className="font-semibold">
          These answers need the extension to fill anything in.
        </strong>{" "}
        It isn&apos;t installed in this browser yet, so nothing on a job site
        will autofill. Saving here still works — the answers wait for you.
      </p>
      <Link
        href="/guided"
        className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        Install the extension →
      </Link>
    </div>
  );
}
