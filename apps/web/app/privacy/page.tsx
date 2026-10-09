import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy — JobAssistUI",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 8, 2026">
      <p>
        This policy explains what information JobAssistUI collects, why, and
        what your choices are. The short version: we store the job-search
        records you create so we can show them back to you and export them,
        if you use the AI tools we send your resume and job posts to Anthropic
        to process them, we use a payment processor for billing, and we do
        not sell your data.
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
          <strong>Settings:</strong> your state, weekly target, and
          reporting period start day.
        </li>
        <li>
          <strong>Resume (if you use the AI tools):</strong> the resume file
          name, its text, and the profile built from it (name, contact
          details, work history, education and skills).
        </li>
        <li>
          <strong>AI usage:</strong> a count of AI requests per day, used
          to enforce the daily limit.
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

      <h2>2. AI tools (Guided)</h2>
      <p>
        When you use the AI tools, we send your resume (the PDF or text you
        give us) and the job posting you pick or paste to Anthropic, which
        runs the AI model. Anthropic processes it to return the result and
        does not use it to train its models. If you paste a job link, our
        server fetches that page to read the posting. Job lists come from
        public company career sites and job boards.
      </p>
      <p>
        We save your resume profile so you don&apos;t have to upload it each
        time. The tailored resume, cover letter and answers are drafts made
        for you to copy and edit. When you tap &quot;I
        applied&quot;, we add that job to your activity log. We never submit
        an application for you.
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
        (database, authentication, and file storage), Anthropic (AI
        processing of resumes and job posts), Stripe (payments), and Vercel
        (hosting). Each receives only what it needs to perform its
        role and is bound by its own privacy and security commitments.
      </p>

      <h2>5. Data retention and deletion</h2>
      <p>
        Your records are kept for as long as your account exists so your
        compliance history stays available to you. If you want your account
        and all associated data (records, screenshots, resume, settings)
        deleted,
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
