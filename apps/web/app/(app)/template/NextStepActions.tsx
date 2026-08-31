"use client";

import Link from "next/link";
import { useExtensionInstalled } from "@/components/useExtensionInstalled";

// The buttons under "Saved. Here's what to do next."
//
// THE BUG THIS FIXES: this card used to send everyone straight to Indeed, and
// the extension was mentioned once in grey text at the bottom as a caveat. The
// page it sits on promises "open a job, click Apply, and the form comes up
// already filled" — so someone without the extension saved their answers,
// clicked through to Indeed, applied, and nothing happened. From their side the
// feature was simply broken, and nothing on the page told them why or what to
// do about it.
//
// So the primary button now depends on what they actually have. No extension:
// install it, because Indeed is useless first. Extension: go to Indeed, because
// that is genuinely the next step.
export function NextStepActions({ indeedUrl }: { indeedUrl: string }) {
  const installed = useExtensionInstalled();

  // null = still detecting. Render the buttons in their neutral order rather
  // than flashing "Install the extension" at someone who already has it.
  if (installed === null) {
    return <div className="mt-4 h-10" aria-hidden />;
  }

  if (!installed) {
    return (
      <>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/guided"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Install the extension →
          </Link>
          <span className="text-xs text-emerald-800">
            Takes a couple of minutes, on a computer.
          </span>
        </div>
        <p className="mt-4 border-t border-emerald-200 pt-3 text-xs text-emerald-800">
          Your answers are saved either way. Without the extension they just sit
          here until you install it — and you can log activities by hand on any
          device, which is free and always will be.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={indeedUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Open my job search on Indeed →
        </a>
        <span className="text-xs text-emerald-800">
          Look for jobs marked <strong>Easy Apply</strong> — those are the ones
          it can fill.
        </span>
      </div>
      <p className="mt-4 border-t border-emerald-200 pt-3 text-xs text-emerald-800">
        The extension is installed. Open a job, click Apply, and the panel picks
        it up from there.
      </p>
    </>
  );
}
