"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"
import { BrandLogo } from "@/components/BrandLogo"
import { IconLang } from "@/components/icons"
import { useLocale, useT } from "@/components/LocaleProvider"

export default function AdminLoginPage() {
  const router = useRouter()
  const t = useT()
  const { locale, setLocale } = useLocale()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/admin/me", { signal: controller.signal })
      .then((response) => response.json() as Promise<{ username?: string | null; configured?: boolean; error?: string }>)
      .then((data) => {
        if (data.username) {
          router.replace("/admin/users")
          return
        }
        if (data.configured === false) setError(data.error || t("admin.notConfigured"))
        setChecking(false)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setError(t("admin.network"))
        setChecking(false)
      })
    return () => controller.abort()
  }, [router, t])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = (await response.json()) as { username?: string; error?: string }
      if (!response.ok || !data.username) {
        setError(data.error || t("admin.loginFailed"))
        return
      }
      router.replace("/admin/users")
    } catch {
      setError(t("admin.network"))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login-card relative">
        <button
          type="button"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-white/45 transition hover:bg-white/5 hover:text-white/80"
          aria-label={locale === "zh" ? t("account.langEn") : t("account.langZh")}
          onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
        >
          <IconLang className="h-5 w-5" />
        </button>
        <div className="flex flex-col items-center text-center">
          <BrandLogo className="h-14 w-14" />
          <p className="mt-4 text-[11px] font-medium tracking-[0.32em] text-white/40">SHUNKAN</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-white">{t("admin.loginTitle")}</h1>
          <p className="mt-2 text-sm text-white/40">{t("admin.loginHint")}</p>
        </div>

        {checking ? (
          <div className="mt-12 grid place-items-center pb-4">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        ) : (
          <form className="mt-8 space-y-3" onSubmit={(event) => void submit(event)}>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder={t("admin.username")}
              className="admin-field h-12 w-full"
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder={t("admin.password")}
              className="admin-field h-12 w-full"
            />
            {error && <p className="admin-alert-error !mt-1">{error}</p>}
            <button type="submit" disabled={pending} className="admin-btn admin-btn-primary mt-1 h-12 w-full">
              {pending ? t("admin.loggingIn") : t("admin.loginSubmit")}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
