import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "瞬看管理后台",
  description: "用户与 VIP 管理",
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh overflow-y-auto overscroll-contain bg-[#0f1115] text-[#e8eaed]">
      {children}
    </div>
  )
}
