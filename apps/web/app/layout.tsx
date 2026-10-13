import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/site";
import FreePeriodBanner from "@/components/FreePeriodBanner";

// Plex reads like typed paperwork: condensed for headings and form labels,
// regular for body text, mono for dates and counts.
const display = IBM_Plex_Sans_Condensed({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-display",
});
const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-mono",
});

const title = "JobAssistUI: AI job search help for people on unemployment";
const description =
  "Fix your resume, see jobs from real company career sites, and get a tailored resume and cover letter for each one. Every application lands in your free work-search log.";

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
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
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
