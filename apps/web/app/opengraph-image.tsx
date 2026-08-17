import { ImageResponse } from "next/og";
import {
  FREE_UNTIL_LABEL,
  MONTHLY_PRICE,
  isFreePeriod,
} from "@applyassistui/shared";

export const runtime = "edge";
export const alt = "JobAssistUI — Job Search Log for Unemployment Compliance";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, opacity: 0.9 }}>
          JobAssistUI
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: 950,
          }}
        >
          Track your weekly job search. Export a report your state accepts.
        </div>
        <div style={{ marginTop: 36, fontSize: 32, opacity: 0.85 }}>
          {isFreePeriod()
            ? `Free until ${FREE_UNTIL_LABEL} · no credit card`
            : `${MONTHLY_PRICE}/month · 14-day free trial`}
        </div>
      </div>
    ),
    size,
  );
}
