import type { Metadata } from "next";
import Link from "next/link";
import { FREE_UNTIL_LABEL, isFreePeriod } from "@jobassistui/shared";
import { requireOnboarded } from "@/lib/auth";

export const metadata: Metadata = {
  title: "More tools — JobAssistUI",
};

// Home for the extras that sit outside the main path (Resume → Jobs → Apply for
// me → Log). Today that's only the Indeed extension. Add a card to tools() to add one.
// Built per request so the price line flips on its own when the free period ends.
function tools() {
  const addonPrice = isFreePeriod()
    ? `free until ${FREE_UNTIL_LABEL}, then a small extra charge`
    : "a small extra charge each month";
  return [
    {
      href: "/guided",
      tag: "Chrome extension · computer only · extra add-on",
      name: "Indeed add-on",
      blurb: `Fills in Indeed Easy Apply forms with your saved answers, and logs each application for you. You still press submit. It's an extra on top of Guided: ${addonPrice}.`,
      cta: "Set it up",
    },
  ];
}

export default async function MoreToolsPage() {
  await requireOnboarded();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">More tools</h1>
      <p className="mt-2 text-sm text-slate-600">
        Optional extras. You don&apos;t need any of these. Resume, Jobs, Apply
        for me and your Activity log do the main work on any device.
      </p>

      <ul className="mt-6 space-y-4">
        {tools().map((t) => (
          <li key={t.href} className="border-[1.5px] border-brand bg-white p-5">
            <p className="form-label">{t.tag}</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{t.name}</h2>
            <p className="mt-1 text-sm text-slate-600">{t.blurb}</p>
            <Link
              href={t.href}
              className="mt-4 inline-block border-[1.5px] border-brand px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-brand hover:bg-paper-field"
            >
              {t.cta}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
