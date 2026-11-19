import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "瞬看管理后台",
  description: "用户、订单与系统配置",
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-root">{children}</div>
}
