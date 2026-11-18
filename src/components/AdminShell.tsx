"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { BrandLogo } from "@/components/BrandLogo"

const NAV = [
  { href: "/admin/users", label: "用户", hint: "账号与 VIP" },
  { href: "/admin/orders", label: "订单", hint: "充值与到账" },
  { href: "/admin/settings", label: "配置", hint: "额度与价格" },
] as const

type Props = {
  title: string
  description?: string
  adminName: string | null
  children: ReactNode
  actions?: ReactNode
}

export function AdminShell({ title, description, adminName, children, actions }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" })
    router.replace("/admin")
  }

  return (
    <div className="admin-shell">
      <aside className="admin-aside">
        <div className="admin-brand">
          <BrandLogo className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold tracking-wide text-white">瞬看</p>
            <p className="truncate text-[11px] tracking-[0.22em] text-white/35">CONTROL</p>
          </div>
        </div>

        <nav className="admin-nav">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-link${active ? " is-active" : ""}`}
              >
                <span className="text-[14px] font-medium">{item.label}</span>
                <span className="text-[11px] text-white/30">{item.hint}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto space-y-3 border-t border-white/[0.06] pt-4">
          <div className="px-1">
            <p className="text-[11px] tracking-wide text-white/30">已登录</p>
            <p className="mt-0.5 truncate text-sm text-white/75">{adminName || "…"}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Link href="/" className="admin-aside-action">
              回前台
            </Link>
            <button type="button" className="admin-aside-action" onClick={() => void logout()}>
              退出登录
            </button>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold tracking-tight text-white sm:text-[26px]">
              {title}
            </h1>
            {description ? <p className="mt-1 text-sm text-white/40">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>

        <nav className="admin-mobile-nav">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-mobile-link${active ? " is-active" : ""}`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="admin-content">{children}</div>
      </div>
    </div>
  )
}
