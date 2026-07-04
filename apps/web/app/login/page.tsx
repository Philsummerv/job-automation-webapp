import { Suspense } from "react";
import Link from "next/link";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-xl font-bold text-brand">
        ApplyAssistUI
      </Link>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">
        We&apos;ll email you a secure sign-in link — no password needed.
      </p>

      <Suspense fallback={<div className="mt-6 text-sm text-slate-400">Loading…</div>}>
        <LoginForm />
      </Suspense>

      <p className="mt-8 text-xs text-slate-500">
        By signing in you agree to our documentation-tool terms. ApplyAssistUI is a
        user-directed job-search documentation tool; you initiate and confirm
        every action.
      </p>
    </main>
  );
}
