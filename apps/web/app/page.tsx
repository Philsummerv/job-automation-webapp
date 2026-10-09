import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/site";
import {
  FREE_UNTIL_LABEL,
  MONTHLY_PRICE,
  isFreePeriod,
} from "@jobassistui/shared";

const STEPS = [
  {
    title: "1. Add your resume",
    body: "Upload a PDF or paste the text. We turn it into a clean profile: your jobs, skills and the titles you want.",
  },
  {
    title: "2. See jobs that fit",
    body: "We pull open jobs straight from company career sites. Each one gets a match score and a one-line reason.",
  },
  {
    title: "3. Get an apply kit",
    body: "Pick a job and get a resume tuned to it, a cover letter, and draft answers to common questions.",
  },
  {
    title: "4. It's logged for you",
    body: "Apply on the company's site. Then tap \"I applied\" and it goes into your work-search log for the week.",
  },
];

export default function LandingPage() {
  const free = isFreePeriod();

  const guidedPrice = free
    ? `free until ${FREE_UNTIL_LABEL}, then ${MONTHLY_PRICE}/month`
    : `${MONTHLY_PRICE}/month after a 14-day free trial`;

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-brand">JobAssistUI</span>
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
              Beta
            </span>
          </span>
          <div className="flex items-center gap-4 text-sm">
            <a href="#how" className="hidden text-slate-600 hover:text-slate-900 sm:inline">
              How it works
            </a>
            <a href="#pricing" className="hidden text-slate-600 hover:text-slate-900 sm:inline">
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
      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          For people on unemployment
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight text-slate-900 sm:text-5xl">
          Find jobs that fit. Apply faster. Your weekly log fills itself.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          Fix up your resume, see open jobs from real company career sites, and
          get a resume and cover letter made for each job. Every application
          you make lands in your work-search log, ready for your weekly claim.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark"
          >
            Get started free
          </Link>
          <a href="#how" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            See how it works →
          </a>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          The work-search log is free forever. No credit card. The AI tools are{" "}
          {guidedPrice}.
        </p>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold">How it works</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((c) => (
              <div key={c.title} className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="font-semibold text-slate-900">{c.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{c.body}</p>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-10 max-w-2xl space-y-3 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
            <p>
              <strong>It only uses what&apos;s true.</strong> The tailored resume
              and cover letter reword what is already on your resume. They never
              add jobs, degrees or skills you don&apos;t have. If a job asks for
              something you don&apos;t list, we show it as a gap so you can decide.
            </p>
            <p>
              <strong>You apply, not us.</strong> We link you to the job on the
              company&apos;s own site. You read it, fill it in and press submit.
              Nothing is ever sent for you.
            </p>
            <p>
              <strong>Works on a phone.</strong> Everything runs in the browser.
              Nothing to install.
            </p>
          </div>
        </div>
      </section>

      {/* Founder note */}
      <section className="border-t border-slate-100">
        <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-6 sm:p-8">
            <span className="rounded bg-sky-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
              Early beta
            </span>
            <h2 className="mt-4 text-xl font-semibold text-slate-900">
              I built this because I wanted to be sure about my own claim
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
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
      <section id="pricing" className="border-t border-slate-100">
        <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold">The log is free. Always.</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-slate-600">
            You&apos;re on unemployment. You shouldn&apos;t have to pay to prove
            you looked for work. Logging, weekly tracking and exports cost
            nothing and never will.
          </p>
          <div className="mt-8 rounded-2xl border border-slate-200 p-6 shadow-sm sm:p-8">
            <div className="text-4xl font-bold">Free</div>
            <p className="mt-1 text-sm text-slate-600">
              No credit card, ever, for the log.
            </p>
            <div className="mt-5 border-t border-slate-200 pt-5 text-left text-sm text-slate-600">
              <p>
                <strong className="text-slate-900">
                  The AI tools are the one paid part
                </strong>{" "}
                (we call it Guided). Resume help, job matches and apply kits are{" "}
                {guidedPrice}.{" "}
                {free
                  ? "Nothing is charged before then, and skipping it costs you nothing else."
                  : "Skipping it costs you nothing else."}
              </p>
            </div>
            <ul className="mt-6 space-y-2 text-left text-sm text-slate-700">
              <li>✓ Unlimited activity logging <span className="text-slate-400">· free</span></li>
              <li>✓ Weekly target tracking <span className="text-slate-400">· free</span></li>
              <li>✓ PDF and CSV exports <span className="text-slate-400">· free</span></li>
              <li>✓ Evidence screenshots <span className="text-slate-400">· free</span></li>
              <li>
                ✓ Resume help, job matches and apply kits{" "}
                <span className="text-slate-400">
                  · Guided, {free ? `free until ${FREE_UNTIL_LABEL}` : `${MONTHLY_PRICE}/month`}
                </span>
              </li>
            </ul>
            <Link
              href="/login"
              className="mt-8 block rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark"
            >
              Get started free
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto max-w-5xl px-4 py-8 text-center text-xs text-slate-500 sm:px-6">
          <p>
            JobAssistUI helps you search for jobs and keep a record of it. It is
            not legal advice, and rules vary by state. You are responsible for
            what you submit and for meeting your state&apos;s rules. AI writing
            can be wrong, so check it before you use it.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=JobAssistUI%20feedback`}
              className="hover:text-slate-900"
            >
              Report a bug
            </a>
            <Link href="/terms" className="hover:text-slate-900">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
