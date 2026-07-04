import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AutoApply — Job Search Log for Unemployment Compliance",
  description:
    "Document your weekly job-search activities and export a DOL-ready report. A user-directed job-search documentation tool.",
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
