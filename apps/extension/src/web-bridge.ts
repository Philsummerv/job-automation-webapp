// Bridge content script — runs ONLY on the ApplyAssistUI web-app origin. It
// probes /api/extension/session SAME-ORIGIN, so the user's login cookies flow
// automatically (no token handoff, no externally_connectable), and relays
// sign-in + entitlement to the service worker. The worker caches it and gates
// Indeed runs on it.

import { sendToWorker } from "./messages";

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

// Report on load, and whenever the tab regains focus (catches a sign-in/out
// that happened while this tab was backgrounded).
reportAuth();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") reportAuth();
});
