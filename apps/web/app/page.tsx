import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/site";
import {
  FREE_UNTIL_LABEL,
  MONTHLY_PRICE,
  isFreePeriod,
} from "@jobassistui/shared";

const STEPS = [
  {
    title: "Add your resume",
    body: "Upload a PDF or paste the text. We turn it into a clean profile: your jobs, skills and the titles you want.",
  },
  {
    title: "See jobs that fit",
    body: "We pull open jobs straight from company career sites. Each one gets a match score and a one-line reason.",
  },
  {
    title: "Tap \"Apply for me\"",
    body: "We open the company's real application form and fill it in from your resume and saved answers.",
  },
  {
    title: "You check it and submit",
    body: "You see the form right on our page. Fix anything, press submit, and it goes into your work-search log.",
  },
];

const DAYS = [
  { d: "MON", done: true },
  { d: "TUE", done: false },
  { d: "WED", done: true },
  { d: "THU", done: false },
  { d: "FRI", done: false },
  { d: "SAT", done: false },
  { d: "SUN", done: false },
];

export default function LandingPage() {
  const free = isFreePeriod();

  const guidedPrice = free
    ? `free until ${FREE_UNTIL_LABEL}, then ${MONTHLY_PRICE}/month`
    : `${MONTHLY_PRICE}/month after a 14-day free trial`;

  const FEES = [
    { item: "Activity log, unlimited entries", cost: "Free" },
    { item: "Weekly target tracking", cost: "Free" },
    { item: "PDF and CSV exports", cost: "Free" },
    { item: "Evidence screenshots", cost: "Free" },
    {
      item: "Apply for me, resume help, job matches and apply kits (Guided)",
      cost: free ? `Free until ${FREE_UNTIL_LABEL}` : `${MONTHLY_PRICE}/mo`,
    },
    {
      // Billing for the add-on is not built yet. It is free like everything
      // else during the free period; after that it will be an extra charge.
      item: "Indeed add-on for Chrome (extra, on top of Guided)",
      cost: free ? `Free until ${FREE_UNTIL_LABEL}` : "Extra charge",
    },
  ];

  return (
    <div className="ruled min-h-screen text-brand">
      {/* Nav */}
      <header className="border-b-2 border-brand bg-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="flex items-baseline gap-2 font-display">
            <span className="text-lg font-bold uppercase tracking-wide">JobAssistUI</span>
            <span className="hidden text-xs uppercase tracking-[0.1em] text-slate-600 sm:inline">
              Work search record
            </span>
            <span className="font-mono text-[10px] text-slate-600">BETA</span>
          </span>
          <div className="flex items-center gap-5 font-display text-sm uppercase tracking-wide">
            <a href="#how" className="hidden hover:underline sm:inline">
              How it works
            </a>
            <a href="#pricing" className="hidden hover:underline sm:inline">
              Pricing
            </a>
            <Link
              href="/login"
              className="bg-brand px-4 py-2 font-bold text-paper hover:bg-brand-dark"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-5xl items-start gap-10 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="font-mono text-xs uppercase">For people on unemployment</p>
          <h1 className="mt-3 text-4xl leading-[1.02] sm:text-6xl">
            Find jobs that fit. Your weekly log fills itself.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-700">
            Fix up your resume and see open jobs from real company career
            sites. Tap &quot;Apply for me&quot; and we fill in the
            application. You check it and press submit. Every application
            lands in your work-search log, ready for your weekly claim.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link
              href="/login"
              className="bg-brand px-6 py-3 font-display font-bold uppercase tracking-wide text-paper hover:bg-brand-dark"
            >
              Start my log →
            </Link>
            <a href="#how" className="font-display text-sm uppercase tracking-wide hover:underline">
              See how it works
            </a>
          </div>
          <p className="mt-4 max-w-md text-xs text-slate-600">
            The work-search log is free forever. No credit card. The AI tools
            are {guidedPrice}.
          </p>
        </div>

        {/* Sample record */}
        <div aria-label="Example of a weekly record" className="font-display">
          <p className="mb-2 font-mono text-[11px] uppercase text-slate-600">
            Example · what your week looks like
          </p>
          <div className="relative border-[1.5px] border-brand bg-paper-field">
            <div className="px-3 pt-2">
              <span className="form-label">Week ending</span>
              <p className="pb-2 font-mono text-[15px]">SUN 10/12/2026</p>
            </div>
            <span className="stamp absolute right-3 top-3 bg-paper-field/70">Logged</span>
            <div className="grid grid-cols-7 border-t-[1.5px] border-brand">
              {DAYS.map((x) => (
                <div
                  key={x.d}
                  className="border-r border-brand py-1 text-center font-mono text-[11px] last:border-r-0"
                >
                  <span className="block h-6 text-base">{x.done ? "✓" : ""}</span>
                  {x.d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_auto] border-t-[1.5px] border-brand">
              <div className="px-3 pt-2">
                <span className="form-label">Activities</span>
                <p className="pb-2 font-mono text-[15px]">2 of 3</p>
              </div>
              <div className="border-l-[1.5px] border-brand px-3 pt-2">
                <span className="form-label">Still needed</span>
                <p className="pb-2 font-mono text-[15px]">1</p>
              </div>
            </div>
          </div>
          <div className="mt-4 border-[1.5px] border-brand bg-paper-field">
            <div className="px-3 pt-2">
              <span className="form-label">Employer · Title</span>
              <p className="pb-2 font-mono text-[15px]">Hudson Freight Co. · Dispatch Coordinator</p>
            </div>
            <div className="grid grid-cols-[1fr_auto] border-t-[1.5px] border-brand">
              <div className="px-3 pt-2">
                <span className="form-label">Method</span>
                <p className="pb-2 font-mono text-[15px]">Applied online</p>
              </div>
              <div className="border-l-[1.5px] border-brand px-3 pt-2">
                <span className="form-label">Match</span>
                <p className="pb-2 font-mono text-[15px]">86%</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t-2 border-brand bg-paper">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold uppercase tracking-tight">How it works</h2>
          {/* gap + brand background draws the inner rules at every width. */}
          <ol className="mt-8 grid gap-[1.5px] border-[1.5px] border-brand bg-brand sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((c, i) => (
              <li
                key={c.title}
                className="bg-paper-field p-5"
              >
                <span className="form-label">Step {i + 1}</span>
                <h3 className="mt-1 text-lg font-bold">{c.title}</h3>
                <p className="mt-2 text-sm text-slate-700">{c.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-8 grid gap-6 text-sm text-slate-700 md:grid-cols-3">
            <div>
              <h3 className="font-bold uppercase tracking-wide text-brand">It only uses what&apos;s true</h3>
              <p className="mt-2">
                Everything we write comes from your own resume and answers. We
                never add jobs, degrees or skills you don&apos;t have. If a
                form asks something we don&apos;t know, we leave it blank and
                tell you.
              </p>
            </div>
            <div>
              <h3 className="font-bold uppercase tracking-wide text-brand">We fill it in. You press submit.</h3>
              <p className="mt-2">
                &quot;Apply for me&quot; opens the company&apos;s own
                application in a browser we run for you, and fills it in. You
                watch it on our page, fix anything you want, and press submit
                yourself. We never send an application for you.
              </p>
            </div>
            <div>
              <h3 className="font-bold uppercase tracking-wide text-brand">Works on a phone</h3>
              <p className="mt-2">Everything runs in the browser. Nothing to install.</p>
            </div>
          </div>
          <p className="mt-8 border-t border-paper-line pt-4 text-sm text-slate-700">
            <strong className="text-brand">Optional add-on:</strong> if you apply
            on Indeed from a computer, a Chrome extension can fill in the Easy
            Apply forms with your saved answers. You still check each page and
            press submit yourself. It&apos;s an extra on top of Guided.{" "}
            {free
              ? `It's free until ${FREE_UNTIL_LABEL} like everything else. After that it will cost a little extra.`
              : "It costs a little extra each month."}{" "}
            You don&apos;t need it for anything else.
          </p>
        </div>
      </section>

      {/* Founder note */}
      <section className="border-t-2 border-brand">
        <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
          <div className="relative border-[1.5px] border-brand bg-paper-field p-6 sm:p-8">
            <div className="grid gap-1 border-b border-brand pb-4 font-mono text-xs">
              <p>FROM: The person who built this</p>
              <p>RE: Why it exists</p>
            </div>
            <span className="stamp absolute right-4 top-4">Early beta</span>
            <h2 className="mt-5 text-xl font-bold">
              I built this because I wanted to be sure about my own claim
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-800">
              <p>
                I&apos;ve been claiming unemployment in New York since March
                2026. Every week you certify the same things: that you looked
                for work, that you had no other income and no holiday pay, that
                you were ready and able to take a job.
              </p>
              <p>
                I never missed a week. I just wanted to be <em>100% sure</em> I
                hadn&apos;t. So I built something to keep the record for me.
                Then I wanted the applying part to take less time too, so I
                added that.
              </p>
              <p>
                The log is free, and it stays free. No card, no trial, nothing
                to cancel. The AI tools are {guidedPrice}. I&apos;d rather
                people just use it and decide then.
              </p>
              <p>
                It&apos;s early and I built it myself, so some things will be
                wrong. If something breaks or reads wrong, tell me. There&apos;s
                a Feedback link inside the app and it comes straight to me.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t-2 border-brand bg-paper">
        <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold uppercase tracking-tight">The log is free. Always.</h2>
          <p className="mt-3 max-w-lg text-sm text-slate-700">
            You&apos;re on unemployment. You shouldn&apos;t have to pay to prove
            you looked for work. Logging, weekly tracking and exports cost
            nothing and never will.
          </p>
          <table className="mt-8 w-full border-[1.5px] border-brand bg-paper-field text-sm">
            <thead>
              <tr className="border-b-[1.5px] border-brand text-left">
                <th className="form-label px-4 py-2">Item</th>
                <th className="form-label border-l-[1.5px] border-brand px-4 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {FEES.map((f) => (
                <tr key={f.item} className="border-b border-paper-line last:border-b-0">
                  <td className="px-4 py-2.5">{f.item}</td>
                  <td className="whitespace-nowrap border-l-[1.5px] border-brand px-4 py-2.5 text-right font-mono">
                    {f.cost}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-slate-700">
            <strong className="text-brand">The AI tools are the main paid plan</strong>{" "}
            (we call it Guided). That&apos;s Apply for me, resume help, job
            matches and apply kits. They are {guidedPrice}.{" "}
            {free
              ? "Nothing is charged before then, and skipping it costs you nothing else."
              : "Skipping it costs you nothing else."}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            The Indeed add-on is a separate extra on top of Guided.{" "}
            {free
              ? "It's free until then too, and will cost a little extra after."
              : "It costs a little extra each month."}
          </p>
          <Link
            href="/login"
            className="mt-8 inline-block bg-brand px-6 py-3 font-display font-bold uppercase tracking-wide text-paper hover:bg-brand-dark"
          >
            Start my log →
          </Link>
        </div>
      </section>

      <footer className="border-t-2 border-brand bg-paper">
        <div className="mx-auto max-w-5xl px-4 py-8 text-xs text-slate-600 sm:px-6">
          <p className="font-semibold text-brand">
            JobAssistUI is not a government website. It is not part of, or
            approved by, any state Department of Labor.
          </p>
          <p className="mt-2">
            It helps you search for jobs and keep a record of it. It is not
            legal advice, and rules vary by state. You are responsible for what
            you submit and for meeting your state&apos;s rules. AI writing can
            be wrong, so check it before you use it.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-6 font-display uppercase tracking-wide">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=JobAssistUI%20feedback`}
              className="hover:text-brand hover:underline"
            >
              Report a bug
            </a>
            <Link href="/terms" className="hover:text-brand hover:underline">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-brand hover:underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
