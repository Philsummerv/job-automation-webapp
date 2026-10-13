"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 30_000;

// Upload a resume PDF or paste the text. Posts to /api/ai/resume, which reads
// it with AI and saves the profile; then refreshes the page to show it.
export default function ResumeUpload({ hasResume }: { hasResume: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"pdf" | "text">("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function pickFile(f: File | null) {
    setError(null);
    setDone(false);
    if (!f) return setFile(null);
    if (f.size > MAX_PDF_BYTES) {
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return setError("That file is too big. The limit is 5 MB.");
    }
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return setError("Please pick a PDF. For a Word file, save it as PDF or paste the text.");
    }
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    const body = new FormData();
    if (mode === "pdf") {
      if (!file) return setError("Pick a PDF first.");
      body.set("file", file);
    } else {
      const t = text.trim();
      if (!t) return setError("Paste your resume text first.");
      if (t.length > MAX_TEXT_CHARS)
        return setError(`That text is too long. The limit is ${MAX_TEXT_CHARS.toLocaleString()} characters.`);
      body.set("text", t);
    }

    setBusy(true);
    try {
      const res = await fetch("/api/ai/resume", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error || "Something went wrong. Try again.");
        return;
      }
      setDone(true);
      setFile(null);
      setText("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: "pdf" | "text", label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setError(null);
      }}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        mode === m ? "bg-paper-field text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
      }`}
      aria-pressed={mode === m}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        {tab("pdf", "Upload PDF")}
        {tab("text", "Paste text")}
      </div>

      {mode === "pdf" ? (
        <div>
          <label htmlFor="resume-file" className="block text-sm font-medium">
            Resume PDF <span className="text-slate-400">(up to 5 MB)</span>
          </label>
          <input
            id="resume-file"
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            disabled={busy}
            className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
          />
        </div>
      ) : (
        <div>
          <label htmlFor="resume-text" className="block text-sm font-medium">
            Resume text
          </label>
          <textarea
            id="resume-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            rows={12}
            maxLength={MAX_TEXT_CHARS}
            placeholder="Paste your whole resume here."
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <p className="mt-1 text-xs text-slate-500">
            {text.length.toLocaleString()} / {MAX_TEXT_CHARS.toLocaleString()} characters
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {done && !error && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Done. Check the details below and fix anything that is wrong.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-display font-bold uppercase tracking-wide text-paper hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? "Reading your resume…" : hasResume ? "Replace my resume" : "Read my resume"}
        </button>
        {busy && (
          <span className="text-sm text-slate-500">This can take up to a minute.</span>
        )}
      </div>
      {hasResume && !busy && (
        <p className="text-xs text-slate-500">
          A new upload replaces the details below, including any edits you made.
        </p>
      )}
    </form>
  );
}
