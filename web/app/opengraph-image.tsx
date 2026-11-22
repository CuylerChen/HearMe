import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f7f5f1",
          color: "#1f2925",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 650 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              border: "8px solid #4e685e",
            }}
          />
          HearMe
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 860 }}>
          <div style={{ fontSize: 68, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
            Your private space to be heard.
          </div>
          <div style={{ fontSize: 32, color: "#5c675f" }}>Sometimes, you just need someone to listen.</div>
        </div>
        <div style={{ fontSize: 24, color: "#4e685e" }}>A gentle voice. No pressure. No judgment.</div>
      </div>
    ),
    size,
  );
}
