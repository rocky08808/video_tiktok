"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"
import { AdminShell } from "@/components/AdminShell"
import { useT } from "@/components/LocaleProvider"
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/settings-types"

type FormDraft = {
  freeDailyVideos: string
  freeDailyPics: string
  freeDailyMovies: string
  inviteNeed: string
  vipPriceUsdt: string
}

function toDraft(settings: AppSettings): FormDraft {
  return {
    freeDailyVideos: String(settings.freeDailyVideos),
    freeDailyPics: String(settings.freeDailyPics),
    freeDailyMovies: String(settings.freeDailyMovies),
    inviteNeed: String(settings.inviteNeed),
    vipPriceUsdt: String(settings.vipPriceUsdt),
  }
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const t = useT()
  const [adminName, setAdminName] = useState<string | null>(null)
  const [form, setForm] = useState<FormDraft>(() => toDraft(DEFAULT_APP_SETTINGS))
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function parsePositiveInt(raw: string, label: string, min: number, max: number) {
    const text = raw.trim()
    if (!text) throw new Error(t("admin.required", { label }))
    const value = Number(text)
    if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error(t("admin.needInt", { label }))
    if (value < min || value > max) throw new Error(t("admin.range", { label, min, max }))
    return value
  }

  function parsePrice(raw: string) {
    const text = raw.trim()
    if (!text) throw new Error(t("admin.priceRequired"))
    const value = Number(text)
    if (!Number.isFinite(value) || value <= 0) throw new Error(t("admin.pricePositive"))
    if (value < 0.001 || value > 10000) throw new Error(t("admin.priceRange"))
    return Math.round(value * 1000) / 1000
  }

  function parseDraft(draft: FormDraft): AppSettings {
    return {
      freeDailyVideos: parsePositiveInt(draft.freeDailyVideos, t("admin.dailyVideos"), 1, 500),
      freeDailyPics: parsePositiveInt(draft.freeDailyPics, t("admin.dailyPics"), 1, 500),
      freeDailyMovies: parsePositiveInt(draft.freeDailyMovies, t("admin.dailyMovies"), 1, 500),
      inviteNeed: parsePositiveInt(draft.inviteNeed, t("admin.inviteNeed"), 1, 100),
      vipPriceUsdt: parsePrice(draft.vipPriceUsdt),
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/admin/me", { signal: controller.signal })
      .then((response) => response.json() as Promise<{ username?: string | null }>)
      .then(async (data) => {
        if (!data.username) {
          router.replace("/admin")
          return
        }
        setAdminName(data.username)
        const settingsResponse = await fetch("/api/admin/settings", { signal: controller.signal })
        if (settingsResponse.status === 401) {
          router.replace("/admin")
          return
        }
        const settings = (await settingsResponse.json()) as AppSettings & { error?: string }
        if (!settingsResponse.ok) {
          setError(settings.error || t("admin.loadSettingsFailed"))
          setLoading(false)
          return
        }
        setForm(
          toDraft({
            freeDailyVideos: settings.freeDailyVideos,
            freeDailyPics: settings.freeDailyPics,
            freeDailyMovies: settings.freeDailyMovies,
            inviteNeed: settings.inviteNeed,
            vipPriceUsdt: settings.vipPriceUsdt,
          }),
        )
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setError(t("admin.network"))
        setLoading(false)
      })
    return () => controller.abort()
  }, [router, t])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      const payload = parseDraft(form)
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await response.json()) as AppSettings & { error?: string }
      if (response.status === 401) {
        router.replace("/admin")
        return
      }
      if (!response.ok) {
        setError(data.error || t("admin.saveFailed"))
        return
      }
      setForm(toDraft(data))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("admin.network"))
    } finally {
      setPending(false)
    }
  }

  return (
    <AdminShell title={t("admin.settingsTitle")} description={t("admin.settingsDesc")} adminName={adminName}>
      {loading ? (
        <div className="grid place-items-center py-20">
          <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      ) : (
        <form className="mx-auto max-w-2xl space-y-4" onSubmit={(event) => void submit(event)}>
          <section className="admin-card">
            <p className="text-[15px] font-semibold text-white">{t("admin.quotaTitle")}</p>
            <p className="mt-1 text-[12px] text-white/40">{t("admin.quotaHint")}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-white/50">{t("admin.dailyVideos")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.freeDailyVideos}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, freeDailyVideos: event.target.value }))
                  }
                  className="admin-field mt-2 w-full"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/50">{t("admin.dailyPics")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.freeDailyPics}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, freeDailyPics: event.target.value }))
                  }
                  className="admin-field mt-2 w-full"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/50">{t("admin.dailyMovies")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.freeDailyMovies}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, freeDailyMovies: event.target.value }))
                  }
                  className="admin-field mt-2 w-full"
                />
              </label>
            </div>
          </section>

          <section className="admin-card">
            <p className="text-[15px] font-semibold text-white">{t("admin.priceTitle")}</p>
            <p className="mt-1 text-[12px] text-white/40">{t("admin.priceHint")}</p>
            <label className="mt-4 block text-sm">
              <span className="text-white/50">{t("admin.priceLabel")}</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.vipPriceUsdt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, vipPriceUsdt: event.target.value }))
                }
                className="admin-field mt-2 w-full max-w-xs"
              />
            </label>
          </section>

          <section className="admin-card">
            <p className="text-[15px] font-semibold text-white">{t("admin.inviteTitle")}</p>
            <p className="mt-1 text-[12px] text-white/40">{t("admin.inviteHint")}</p>
            <label className="mt-4 block text-sm">
              <span className="text-white/50">{t("admin.inviteNeed")}</span>
              <input
                type="text"
                inputMode="numeric"
                value={form.inviteNeed}
                onChange={(event) =>
                  setForm((current) => ({ ...current, inviteNeed: event.target.value }))
                }
                className="admin-field mt-2 w-full max-w-xs"
              />
            </label>
          </section>

          {error && <p className="admin-alert-error">{error}</p>}
          {saved && <p className="admin-alert-ok">{t("admin.saved")}</p>}

          <button type="submit" disabled={pending} className="admin-btn admin-btn-primary !h-11">
            {pending ? t("admin.saving") : t("admin.saveSettings")}
          </button>
        </form>
      )}
    </AdminShell>
  )
}
