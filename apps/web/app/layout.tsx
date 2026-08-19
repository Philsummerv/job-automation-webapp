import "./globals.css";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/site";
import FreePeriodBanner from "@/components/FreePeriodBanner";

const title = "JobAssistUI — Job Search Log for Unemployment Compliance";
const description =
  "Document your weekly job-search activities and export a clean report for your unemployment claim. A user-directed job-search documentation tool.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  openGraph: {
    title,
    description,
    url: SITE_URL,
    siteName: "JobAssistUI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

// The landing, login and legal pages are statically prerendered, which would
// otherwise bake isFreePeriod() in at build time and leave "free until Jan 1"
// on the site after the date. Hourly ISR (inherited by every child segment)
// means the free-period copy expires on its own with no deploy.
export const revalidate = 3600;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <FreePeriodBanner />
        {children}
        {/* Cookieless page/referrer analytics — how people found the site,
            which is the whole question during the marketing push. */}
        <Analytics />
      </body>
    </html>
  );
}
