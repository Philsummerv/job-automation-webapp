import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-bold text-brand">AutoApply</span>
          <div className="flex items-center gap-4 text-sm">
            <a href="#how" className="text-slate-600 hover:text-slate-900">
              How it works
            </a>
            <a href="#pricing" className="text-slate-600 hover:text-slate-900">
              Pricing
            </a>
            <Link
              href="/login"
              className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          Unemployment job-search compliance
        </p>
        <h1 className="mt-3 text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
          Track your weekly job search. Export a report your state accepts.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          Most states require you to document 3–5 job-search activities every
          week to keep your benefits. AutoApply keeps a clean, exportable log of
          every activity — with dates, employers, methods, and evidence — ready
          for your reporting period.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark"
          >
            Start 14-day free trial
          </Link>
          <a href="#how" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            See how it works →
          </a>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          No credit card to start. $12/month after your trial.
        </p>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold">How it works</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              {
                title: "1. Log each activity",
                body: "Add every job-search activity — application, interview, job fair, networking — in seconds. Attach a screenshot as evidence.",
              },
              {
                title: "2. Track your week",
                body: "See a live count against your state's weekly requirement, grouped by your reporting period. Never come up short.",
              },
              {
                title: "3. Export & submit",
                body: "Download a formatted PDF or CSV for any week, ready to attach to your unemployment claim.",
              },
            ].map((c) => (
              <div key={c.title} className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="font-semibold text-slate-900">{c.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-slate-200 bg-white p-6 text-center">
            <h3 className="font-semibold text-slate-900">
              Optional: Guided assist
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              When you&apos;re applying online, Guided mode streamlines the form and
              captures your confirmation as evidence automatically — but{" "}
              <strong>you stay in control and confirm every submission.</strong>{" "}
              AutoApply never applies to anything without you present.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-slate-100">
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold">Simple pricing</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-slate-600">
            Protect the benefits you rely on for less than a coffee a week. One
            missed reporting week can cost you far more.
          </p>
          <div className="mt-8 rounded-2xl border border-slate-200 p-8 shadow-sm">
            <div className="text-4xl font-bold">
              $12
              <span className="text-base font-normal text-slate-500">/month</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Start with a 14-day free trial.
            </p>
            <ul className="mt-6 space-y-2 text-left text-sm text-slate-700">
              <li>✓ Unlimited activity logging</li>
              <li>✓ Weekly compliance tracking</li>
              <li>✓ PDF &amp; CSV exports</li>
              <li>✓ Evidence storage</li>
              <li>✓ Guided browser assist</li>
            </ul>
            <Link
              href="/login"
              className="mt-8 block rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto max-w-5xl px-6 py-8 text-center text-xs text-slate-500">
          AutoApply is a user-directed job-search documentation tool. It does not
          provide legal advice; requirements vary by state. You are responsible
          for the accuracy of your records and for meeting your state&apos;s rules.
        </div>
      </footer>
    </div>
  );
}
