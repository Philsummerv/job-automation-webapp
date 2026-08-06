import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — JobAssistUI",
};

const SUPPORT_EMAIL = "psommerville3@gmail.com";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 6, 2026">
      <p>
        This policy explains what information JobAssistUI collects, why, and
        what your choices are. The short version: we store the job-search
        records you create so we can show them back to you and export them,
        we use a payment processor for billing, and we do not sell your data.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email address, used to sign you in
          with one-time links.
        </li>
        <li>
          <strong>Activity records:</strong> the job-search entries you create
          — dates, employer names, job titles, methods, results, notes, URLs
          — and any evidence screenshots you upload.
        </li>
        <li>
          <strong>Settings:</strong> your state, weekly target, reporting
          period start day, and (if you use Guided assist) the answer
          template you fill out.
        </li>
        <li>
          <strong>Billing:</strong> subscription status and billing history
          via Stripe. Your card number is collected and stored by Stripe, not
          by us.
        </li>
        <li>
          <strong>Technical:</strong> standard server logs (IP address,
          browser type, pages requested) kept for security and debugging.
        </li>
      </ul>

      <h2>2. Guided assist</h2>
      <p>
        The optional Guided assist feature reads the job-application page you
        are working on in order to suggest form values. It uses your
        JobAssistUI account only to fetch your answer template, check your
        subscription, and record an activity-log entry when you confirm an
        application. It never submits an application without you present and
        confirming.
      </p>

      <h2>3. How we use information</h2>
      <p>
        We use your information solely to operate the Service: signing you
        in, storing and displaying your records, generating exports, tracking
        your weekly count, processing payments, preventing abuse, and
        responding to support requests. We do not sell your personal
        information and we do not use your records for advertising.
      </p>

      <h2>4. Service providers</h2>
      <p>
        We rely on a small number of processors to run the Service: Supabase
        (database, authentication, and file storage), Stripe (payments), and
        Vercel (hosting). Each receives only what it needs to perform its
        role and is bound by its own privacy and security commitments.
      </p>

      <h2>5. Data retention and deletion</h2>
      <p>
        Your records are kept for as long as your account exists so your
        compliance history stays available to you. If you want your account
        and all associated data (records, screenshots, settings) deleted,
        email us at the address below and we will delete them within 30 days.
        Billing records required for tax and accounting purposes are retained
        as required by law.
      </p>

      <h2>6. Security</h2>
      <p>
        Data is encrypted in transit, stored with per-user access controls
        (row-level security), and evidence files live in private storage
        buckets scoped to your account. No method of storage is 100% secure,
        but we design so that one user can never read another user&apos;s
        records.
      </p>

      <h2>7. Your rights</h2>
      <p>
        You can access and export your records at any time from the app
        (PDF/CSV). You can correct or delete individual entries yourself, and
        you can request full account deletion by email. Depending on where
        you live, you may have additional rights (access, portability,
        erasure) — email us and we will honor them.
      </p>

      <h2>8. Children</h2>
      <p>The Service is not directed to anyone under 18.</p>

      <h2>9. Changes</h2>
      <p>
        If we make material changes to this policy, we will notify you by
        email or in the app before they take effect.
      </p>

      <h2>10. Contact</h2>
      <p>
        Privacy questions or deletion requests: <strong>{SUPPORT_EMAIL}</strong>
      </p>
    </LegalPage>
  );
}
