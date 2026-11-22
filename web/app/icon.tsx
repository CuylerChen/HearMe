import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f5f1",
        }}
      >
        <div style={{ width: 22, height: 22, borderRadius: 11, border: "5px solid #4e685e" }} />
      </div>
    ),
    size,
  );
}
