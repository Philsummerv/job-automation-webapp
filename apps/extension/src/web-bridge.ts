// Bridge content script — runs ONLY on the ApplyAssistUI web-app origin. It
// probes /api/extension/session SAME-ORIGIN, so the user's login cookies flow
// automatically (no token handoff, no externally_connectable), and relays
// sign-in + entitlement to the service worker. The worker caches it and gates
// Indeed runs on it.

import { sendToWorker } from "./messages";
import type { AnswerTemplate } from "./storage";

async function reportAuth(): Promise<void> {
  try {
    const res = await fetch("/api/extension/session", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      signedIn?: boolean;
      entitled?: boolean;
      email?: string | null;
    };
    await sendToWorker({
      type: "auth-status",
      signedIn: !!data.signedIn,
      entitled: !!data.entitled,
      email: data.email ?? null,
    });
  } catch {
    // Network hiccup, or the extension was reloaded (context invalidated) —
    // both non-fatal; we'll report again on the next visit/focus.
  }
}

async function syncTemplate(): Promise<void> {
  try {
    const res = await fetch("/api/extension/template", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { template?: AnswerTemplate | null };
    await sendToWorker({ type: "template-sync", template: data.template ?? null });
  } catch {
    // Non-fatal; retried on the next visit/focus.
  }
}

async function flushActivities(): Promise<void> {
  try {
    const res = await sendToWorker({ type: "pending-activities" });
    const activities = res?.activities ?? [];
    if (!activities.length) return;
    const flushed: string[] = [];
    for (const a of activities) {
      try {
        const r = await fetch("/api/extension/activity", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            employer_name: a.employer_name,
            job_title: a.job_title,
            url: a.url,
            date: a.date,
          }),
        });
        if (r.ok) flushed.push(a.id);
      } catch {
        // Leave it queued; retried on the next visit/focus.
      }
    }
    if (flushed.length) await sendToWorker({ type: "activities-flushed", ids: flushed });
  } catch {
    // Non-fatal.
  }
}

function refresh(): void {
  reportAuth();
  syncTemplate();
  flushActivities();
}

// Report on load, and whenever the tab regains focus (catches a sign-in/out or
// template edit that happened while this tab was backgrounded).
refresh();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});
