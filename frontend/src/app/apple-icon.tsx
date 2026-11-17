import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon: the same half-open door as app/icon.svg, on a full-bleed square. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1E5843" }}>
        <svg width="108" height="138" viewBox="0 0 22 28">
          <path d="M4 27 V4.4 C9 3.8 13 3.8 18 4.3 V27 Z" fill="#F2D58A" />
          <path d="M2 27 V2.5 C8 1.6 14 1.6 20 2.4 V27" fill="none" stroke="#F4F6F1" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M5 27 V5 L10.5 7 V25.5 Z" fill="#F4F6F1" />
          <circle cx="9.1" cy="16.5" r="1.1" fill="#B8862C" />
        </svg>
      </div>
    ),
    size,
  );
}
