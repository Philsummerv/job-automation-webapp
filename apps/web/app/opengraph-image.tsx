import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "JobAssistUI: AI job search help for people on unemployment";
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
          Find jobs that fit. Apply faster. Your weekly log fills itself.
        </div>
        <div style={{ marginTop: 36, fontSize: 32, opacity: 0.85 }}>
          Work-search log free forever · no credit card
        </div>
      </div>
    ),
    size,
  );
}
