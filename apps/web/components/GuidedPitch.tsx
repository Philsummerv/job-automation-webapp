"use client";

import Link from "next/link";
import { useExtensionInstalled } from "@/components/useExtensionInstalled";

// The "let it fill the forms for you" card on the dashboard.
//
// Hidden when either signal says they are done with it:
//   - hasGuidedEntry — they have logged a Guided application, so it plainly
//     works for them. Server-side, so it holds on any device.
//   - the extension is installed in this browser — nothing to pitch.
//
// Deliberately NOT hidden just because the log has entries. That was the old
// rule, and it meant somebody logging applications by hand one at a time — the
// exact person autofill is for — never saw the offer after their first entry.
export function GuidedPitch({ hasGuidedEntry }: { hasGuidedEntry: boolean }) {
  const installed = useExtensionInstalled();

  if (hasGuidedEntry) return null;
  // null = still detecting. Render nothing rather than flashing an install
  // prompt at somebody who already has it.
  if (installed !== false) return null;

  return (
    <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-5">
      <h2 className="text-sm font-semibold text-sky-900">
        Applying on Indeed? Let it fill the forms for you.
      </h2>
      <p className="mt-2 text-sm text-sky-900">
        Save your answers once and Guided assist drops them into Indeed
        applications, then logs the application here automatically. You still
        read every page and press submit yourself.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href="/guided"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Set up Guided assist
        </Link>
        <span className="text-xs text-sky-800">
          Chrome extension, on a computer. Everything else works on your phone.
        </span>
      </div>
    </div>
  );
}
