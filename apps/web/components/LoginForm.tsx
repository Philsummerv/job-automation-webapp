"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Where a half-finished sign-in is remembered, and for how long.
 *
 * Getting in means leaving the browser: type your email, go read a code in the
 * mail app, come back. Almost everyone arrives from a Facebook post, so "the
 * browser" is Facebook's in-app webview, which routinely throws the page away
 * while it is backgrounded. Without this they come back holding a good code and
 * find an empty email box — and `verifyOtp` below needs the address they can no
 * longer see, so the code is dead and there is no way forward.
 *
 * `localStorage` rather than `sessionStorage` precisely because sessionStorage
 * dies with the browsing context, and the context being destroyed is the case
 * being fixed here.
 *
 * Only the address is kept. Never the code, never a token.
 */
const PENDING_KEY = "jaui.loginPending";

/**
 * Comfortably longer than a trip to the mail app, and inside Supabase's
 * one-hour code lifetime so a restored panel rarely outlives its own code. When
 * it does, verifyCode already says the code is expired.
 */
const PENDING_TTL_MS = 30 * 60 * 1000;

type PendingLogin = { email: string; sentAt: number };

/**
 * Null on anything unexpected. A truncated or hand-edited value is treated as
 * no value at all rather than throwing out of the effect that reads it.
 */
function readPending(): PendingLogin | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PENDING_KEY);
  } catch {
    // Private mode / storage blocked — touching localStorage throws on access,
    // not just on write. Behaving exactly as before is the safe miss.
    return null;
  }
  if (!raw) return null;

  const parsed = parsePending(raw);
  if (!parsed) {
    // Junk: a half-finished write, or somebody editing devtools. Drop it rather
    // than leave it to be re-parsed and re-rejected on every single page load.
    clearPending();
    return null;
  }
  return parsed;
}

function parsePending(raw: string): PendingLogin | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { email, sentAt } = parsed as Partial<PendingLogin>;
    if (typeof email !== "string" || email === "") return null;
    if (typeof sentAt !== "number" || !Number.isFinite(sentAt)) return null;
    return { email, sentAt };
  } catch {
    return null;
  }
}

function writePending(email: string): void {
  try {
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ email, sentAt: Date.now() }),
    );
  } catch {
    /* non-fatal */
  }
}

function clearPending(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* non-fatal */
  }
}

/**
 * Only ever send someone to a path on this site after signing in.
 *
 * `redirect` comes off the query string, and it ends up in
 * `window.location.assign()`, so an unchecked value is an open redirect: a
 * crafted `?redirect=//evil.com` or `?redirect=https://evil.com` would hand a
 * freshly-authenticated user to somebody else's site. Require a single leading
 * slash and reject protocol-relative `//host` and backslash variants.
 */
function safeRedirect(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

export default function LoginForm() {
  const params = useSearchParams();
  const redirect = safeRedirect(params.get("redirect"));
  const linkFailed = params.get("error") === "auth";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  /**
   * Bumped whenever the user abandons the address they were verifying. A verify
   * already in flight compares against this when it comes back, so a late reply
   * for an abandoned address cannot sign anyone in. See `verifyCode`.
   */
  const attemptRef = useRef(0);

  // Restored in an effect and never during render: localStorage does not exist
  // on the server, so reading it while rendering is a hydration mismatch. The
  // server HTML is therefore always the email form, and this may swap it for the
  // code panel a frame later. That flash is fine — same inverted-default trick
  // AssistantChat uses for its gate.
  useEffect(() => {
    const pending = readPending();
    if (!pending) return;
    if (Date.now() - pending.sentAt >= PENDING_TTL_MS) {
      clearPending();
      return;
    }
    setEmail(pending.email);
    setStatus("sent");
  }, []);

  /**
   * Back to the email field. Without this a restored panel is a trap: someone
   * who mistyped their address, or is signing in as somebody else on a shared
   * phone, has no way out short of clearing site data. The address stays
   * prefilled because a typo is usually one character, not a whole retype.
   */
  function switchEmail() {
    // Abandons any verify still in flight, so its reply is ignored rather than
    // signing them into the account they just walked away from.
    attemptRef.current += 1;
    clearPending();
    setStatus("idle");
    setCode("");
    setError("");
    setVerifying(false);
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      // Written before the state change, so the record exists even if the page
      // is torn down in the same instant the panel appears.
      writePending(email);
      setStatus("sent");
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError("");
    const supabase = createClient();
    const token = code.trim();
    const attempt = attemptRef.current;
    // A first-time email goes through Supabase's "Confirm signup" flow rather
    // than "Magic Link"; retry as a signup token so new users aren't stranded.
    let { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) {
      ({ error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "signup",
      }));
    }
    // They pressed "Use a different email" while this was in the air. Signing
    // them into the address they just left would be worse than doing nothing.
    if (attempt !== attemptRef.current) return;
    if (error) {
      setError(
        error.message.toLowerCase().includes("expired") ||
          error.message.toLowerCase().includes("invalid")
          ? "That code is invalid or expired. Request a new email and use the code from the latest one."
          : error.message,
      );
      setVerifying(false);
    } else {
      // They are in. Clear it before navigating away, or coming back to /login
      // on a shared device shows a stale code panel for the previous person.
      clearPending();
      window.location.assign(redirect);
    }
  }

  if (status === "sent") {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p>
            Check <strong>{email}</strong> for your sign-in code. It comes from{" "}
            <strong>JobAssistUI &lt;login@jobassistui.com&gt;</strong>.
          </p>
          {/* Spam placement is the expected case, not the edge case: a domain
              this new has no sending reputation yet. Say so plainly, and point
              out the code works fine from the spam folder — there is no link
              to click, so a filtered email is an annoyance, not a dead end. */}
          <p className="mt-2">
            Not there within a minute? <strong>Look in spam or junk.</strong>{" "}
            We&apos;re a new sender, so mail often lands there at first — the
            code below works either way, and marking it &ldquo;not spam&rdquo;
            helps the next one arrive properly.
          </p>
        </div>
        <form onSubmit={verifyCode} className="space-y-3">
          <label htmlFor="otp-code" className="block text-sm font-medium">
            Enter the code from the email
          </label>
          <input
            id="otp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="12345678"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-widest focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={verifying || code.trim().length < 6}
            className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-display font-bold uppercase tracking-wide text-paper hover:bg-brand-dark disabled:opacity-60"
          >
            {verifying ? "Verifying…" : "Sign in"}
          </button>
        </form>
        <button
          type="button"
          onClick={switchEmail}
          className="w-full text-center text-sm text-slate-500 underline hover:text-slate-700"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={sendMagicLink} className="mt-6 space-y-4">
      {linkFailed && status === "idle" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          That sign-in link has expired or was already used. Enter your email
          below and we&apos;ll send you a fresh one.
        </div>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
      {status === "error" && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-display font-bold uppercase tracking-wide text-paper hover:bg-brand-dark disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Email me a sign-in code"}
      </button>
    </form>
  );
}
