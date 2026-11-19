"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { BrandLogo } from "@/components/BrandLogo"
import { IconLang } from "@/components/icons"
import { useLocale, useT } from "@/components/LocaleProvider"

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
  const t = useT()
  const { locale, setLocale } = useLocale()

  const nav = [
    { href: "/admin/users", label: t("admin.navUsers"), hint: t("admin.navUsersHint") },
    { href: "/admin/orders", label: t("admin.navOrders"), hint: t("admin.navOrdersHint") },
    { href: "/admin/settings", label: t("admin.navSettings"), hint: t("admin.navSettingsHint") },
  ] as const

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
            <p className="truncate text-[15px] font-semibold tracking-wide text-white">{t("admin.brand")}</p>
            <p className="truncate text-[11px] tracking-[0.22em] text-white/35">{t("admin.control")}</p>
          </div>
        </div>

        <nav className="admin-nav">
          {nav.map((item) => {
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
            <p className="text-[11px] tracking-wide text-white/30">{t("admin.loggedIn")}</p>
            <p className="mt-0.5 truncate text-sm text-white/75">{adminName || "…"}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              className="admin-aside-action flex items-center justify-between gap-2"
              aria-label={locale === "zh" ? t("account.langEn") : t("account.langZh")}
              onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            >
              <span>{t("admin.language")}</span>
              <span className="flex items-center gap-1.5 text-white/55">
                <IconLang className="h-4 w-4" />
                {locale === "zh" ? t("account.langZh") : t("account.langEn")}
              </span>
            </button>
            <Link href="/" className="admin-aside-action">
              {t("admin.front")}
            </Link>
            <button type="button" className="admin-aside-action" onClick={() => void logout()}>
              {t("admin.logout")}
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
          {nav.map((item) => {
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
