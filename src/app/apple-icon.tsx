import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0a10",
        }}
      >
        <div
          style={{
            width: 156,
            height: 156,
            borderRadius: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(145deg, #fe2c55 0%, #7c5cff 50%, #25f4ee 100%)",
            color: "#ffffff",
            fontSize: 78,
            fontWeight: 700,
            letterSpacing: -2,
          }}
        >
          ▶
        </div>
      </div>
    ),
    size,
  )
}
