import { SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

// Outbound mail for the owner's own alerts. Deliberately a raw fetch against
// the Resend REST API rather than the `resend` package: one POST, no new
// dependency to keep patched.
//
// The sending domain is already verified with Resend (it is what Supabase's
// SMTP uses for sign-in codes), so any address on it can send. Overridable for
// anyone running this on a domain that is not.
const FROM = process.env.FEEDBACK_FROM_EMAIL || "JobAssistUI <feedback@jobassistui.com>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 5000;

// Field names match the `feedback` table row exactly, so the inserted object
// can be passed straight through with no mapping layer to drift.
export type FeedbackNotification = {
  kind: string;
  email: string | null;
  message: string;
  page: string | null;
  user_agent: string | null;
};

/**
 * Email the owner that new feedback arrived.
 *
 * NEVER throws and never rejects. The `feedback` row is already committed by
 * the time this runs and the row — not the email — is the source of truth, so
 * a mail outage must degrade to "the owner reads it on /admin instead" and not
 * to a user seeing an error for a report that actually saved.
 */
export async function notifyFeedback(f: FeedbackNotification): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Expected in local dev. In production it means the alert is silently off,
    // so say so loudly enough to find in the Vercel logs.
    console.warn("[feedback] RESEND_API_KEY unset — no email sent; row is on /admin");
    return;
  }

  const from = f.email ?? "a deleted account";
  const body = [
    `${f.kind.toUpperCase()} from ${from}`,
    f.page ? `On page: ${f.page}` : "On page: (not recorded)",
    "",
    f.message,
    "",
    "—",
    `Reply to this email to answer ${from} directly.`,
    `All feedback: ${SITE_URL}/admin`,
    f.user_agent ? `Browser: ${f.user_agent}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [SUPPORT_EMAIL],
        // So hitting Reply in the mail client answers the actual user.
        ...(f.email ? { reply_to: f.email } : {}),
        subject: `[JobAssistUI] ${f.kind} from ${from}`,
        text: body,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[feedback] Resend returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error("[feedback] notification failed (row is saved, see /admin):", err);
  }
}
