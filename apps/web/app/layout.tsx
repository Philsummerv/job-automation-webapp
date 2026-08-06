import "./globals.css";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

const title = "JobAssistUI — Job Search Log for Unemployment Compliance";
const description =
  "Document your weekly job-search activities and export a DOL-ready report. A user-directed job-search documentation tool.";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
