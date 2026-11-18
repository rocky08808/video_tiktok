import type { Metadata } from "next"
import { SITE_NAME } from "@/lib/site"

export const metadata: Metadata = {
  title: "开通 VIP",
  description: `开通 ${SITE_NAME} VIP，无限观看短视频、收藏视频与畅看美图。支持 USDT 充值，也可邀请好友免费升级。`,
  openGraph: {
    title: `开通 VIP · ${SITE_NAME}`,
    description: `无限观看、可收藏、无限美图。立刻开通 ${SITE_NAME} VIP。`,
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function VipLayout({ children }: { children: React.ReactNode }) {
  return children
}
