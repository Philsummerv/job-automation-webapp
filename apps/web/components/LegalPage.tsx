import Link from "next/link";

export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-brand">
            JobAssistUI
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
          {children}
        </div>
      </main>
      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-6 px-6 py-8 text-xs text-slate-500">
          <Link href="/terms" className="hover:text-slate-900">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-slate-900">
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
}
