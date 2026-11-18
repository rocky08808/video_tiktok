import { ImageResponse } from "next/og"

export const size = { width: 64, height: 64 }
export const contentType = "image/png"

export default function Icon() {
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
            width: 56,
            height: 56,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(145deg, #fe2c55 0%, #7c5cff 50%, #25f4ee 100%)",
            color: "#ffffff",
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          ▶
        </div>
      </div>
    ),
    size,
  )
}
