import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service — JobAssistUI",
};

const SUPPORT_EMAIL = "psommerville3@gmail.com";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="August 6, 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of
        JobAssistUI (the &quot;Service&quot;), a user-directed job-search
        documentation tool. By creating an account or using the Service, you
        agree to these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. What the Service is</h2>
      <p>
        JobAssistUI helps you record your job-search activities, track them
        against a weekly target you configure, and export your records as PDF
        or CSV documents. An optional feature (&quot;Guided assist&quot;) can
        help you fill out online job applications and record completed
        applications to your log.
      </p>
      <p>
        JobAssistUI is a documentation tool, not a legal or benefits
        advisor. It does not provide legal advice, does not guarantee that
        your records will satisfy any government agency&apos;s requirements,
        and does not guarantee approval or continuation of unemployment
        benefits. Job-search requirements vary by state and can change; you
        are responsible for knowing and meeting your state&apos;s rules.
      </p>

      <h2>2. You are the actor</h2>
      <p>
        The Service never applies to jobs, submits forms, or takes any action
        on third-party websites without you present and directing it. Guided
        assist only suggests and pre-fills form values; you review and confirm
        every submission yourself. You are solely responsible for the content
        of any application you submit and for the accuracy of every record in
        your activity log. Submitting false or inaccurate job-search records
        to a government agency may have serious legal consequences; you bear
        that responsibility, not us.
      </p>

      <h2>3. Accounts</h2>
      <p>
        You sign in with a one-time email link or code. You are responsible for
        maintaining control of your email account and for all activity that
        occurs under your JobAssistUI account. You must provide accurate
        information and be at least 18 years old to use the Service.
      </p>

      <h2>4. Subscription, trial, and billing</h2>
      <ul>
        <li>
          The Service costs <strong>$12 per month</strong>, billed through
          Stripe, and begins with a <strong>14-day free trial</strong>. A
          payment card is required to start the trial; you are not charged
          until the trial ends.
        </li>
        <li>
          Your subscription renews automatically each month until you cancel.
          You can cancel anytime from the billing page; access continues
          through the end of the period you have paid for.
        </li>
        <li>
          One free trial per person. We may decline or revoke trials that
          appear to circumvent this limit.
        </li>
        <li>
          Except where required by law, payments are non-refundable. If you
          believe you were charged in error, contact us and we will review it.
        </li>
        <li>Prices may change with at least 30 days&apos; notice.</li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          use the Service to create false, misleading, or fraudulent
          job-search records;
        </li>
        <li>
          violate the terms of service of any third-party website you interact
          with while using Guided assist;
        </li>
        <li>
          attempt to access another user&apos;s data, probe or disrupt the
          Service, or resell the Service without our permission.
        </li>
      </ul>

      <h2>6. Your content</h2>
      <p>
        You own the records, screenshots, and other content you store in the
        Service. You grant us a limited license to store, process, and display
        that content solely to operate the Service for you. We do not sell
        your content or use it for advertising.
      </p>

      <h2>7. Termination</h2>
      <p>
        You may stop using the Service and cancel at any time. We may suspend
        or terminate accounts that violate these Terms. On request, we will
        delete your account and stored data (see the Privacy Policy). We
        recommend exporting your records before closing your account.
      </p>

      <h2>8. Disclaimers and limitation of liability</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as
        available,&quot; without warranties of any kind, express or implied.
        To the maximum extent permitted by law, our total liability for any
        claim arising out of or relating to the Service is limited to the
        amount you paid us in the three months before the claim arose. We are
        not liable for indirect, incidental, or consequential damages,
        including loss of benefits, lost records, or decisions made by any
        government agency.
      </p>

      <h2>9. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. If a change is material,
        we will notify you by email or in the app before it takes effect.
        Continuing to use the Service after a change takes effect means you
        accept the updated Terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these Terms: <strong>{SUPPORT_EMAIL}</strong>
      </p>
    </LegalPage>
  );
}
