import { Suspense } from "react";
import Link from "next/link";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="ruled min-h-screen px-4 py-16">
      <div className="mx-auto max-w-md">
        <Link
          href="/"
          className="font-display text-lg font-bold uppercase tracking-wide text-brand"
        >
          JobAssistUI
        </Link>
        <div className="mt-8 border-[1.5px] border-brand bg-paper-field p-6">
          <h1 className="text-2xl text-brand">Sign in</h1>
          <p className="mt-1 text-sm text-slate-700">
            We&apos;ll email you a sign-in code — no password needed.
          </p>

          <Suspense
            fallback={
              <div className="mt-6 text-sm text-slate-400">Loading…</div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-xs text-slate-600">
          By signing in you agree to our{" "}
          <Link href="/terms" className="underline hover:text-slate-900">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-slate-900">
            Privacy Policy
          </Link>
          . JobAssistUI is a user-directed job-search documentation tool; you
          initiate and confirm every action. It is not a government website.
        </p>
      </div>
    </main>
  );
}
