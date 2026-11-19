"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"
import { AdminShell } from "@/components/AdminShell"
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

function parsePositiveInt(raw: string, label: string, min: number, max: number) {
  const text = raw.trim()
  if (!text) throw new Error(`${label}不能为空`)
  const value = Number(text)
  if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error(`${label}需为整数`)
  if (value < min || value > max) throw new Error(`${label}需在 ${min}–${max} 之间`)
  return value
}

function parsePrice(raw: string) {
  const text = raw.trim()
  if (!text) throw new Error("VIP 金额不能为空")
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) throw new Error("VIP 金额需大于 0")
  if (value < 0.001 || value > 10000) throw new Error("VIP 金额需在 0.001–10000 之间")
  return Math.round(value * 1000) / 1000
}

function parseDraft(draft: FormDraft): AppSettings {
  return {
    freeDailyVideos: parsePositiveInt(draft.freeDailyVideos, "每天视频条数", 1, 500),
    freeDailyPics: parsePositiveInt(draft.freeDailyPics, "每天美图张数", 1, 500),
    freeDailyMovies: parsePositiveInt(draft.freeDailyMovies, "每天电影部数", 1, 500),
    inviteNeed: parsePositiveInt(draft.inviteNeed, "邀请人数", 1, 100),
    vipPriceUsdt: parsePrice(draft.vipPriceUsdt),
  }
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const [adminName, setAdminName] = useState<string | null>(null)
  const [form, setForm] = useState<FormDraft>(() => toDraft(DEFAULT_APP_SETTINGS))
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

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
          setError(settings.error || "加载配置失败")
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
        setError("网络不好，稍后再试")
        setLoading(false)
      })
    return () => controller.abort()
  }, [router])

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
        setError(data.error || "保存失败")
        return
      }
      setForm(toDraft(data))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "网络不好，稍后再试")
    } finally {
      setPending(false)
    }
  }

  return (
    <AdminShell title="系统配置" description="调整免费额度、VIP 价格与邀请升级规则" adminName={adminName}>
      {loading ? (
        <div className="grid place-items-center py-20">
          <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      ) : (
        <form className="mx-auto max-w-2xl space-y-4" onSubmit={(event) => void submit(event)}>
          <section className="admin-card">
            <p className="text-[15px] font-semibold text-white">普通用户额度</p>
            <p className="mt-1 text-[12px] text-white/40">按自然日生效；当天已缓存的内容不会立刻重抽</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-white/50">每天视频条数</span>
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
                <span className="text-white/50">每天美图张数</span>
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
                <span className="text-white/50">每天电影部数</span>
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
            <p className="text-[15px] font-semibold text-white">VIP 价格</p>
            <p className="mt-1 text-[12px] text-white/40">USDT（TRC20）基础金额；实际收款会加 0.001 区分订单</p>
            <label className="mt-4 block text-sm">
              <span className="text-white/50">VIP 金额（USDT）</span>
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
            <p className="text-[15px] font-semibold text-white">邀请升级</p>
            <p className="mt-1 text-[12px] text-white/40">
              邀请好友开通 VIP 达到人数后，邀请人获得 100 天；已是 VIP 可按同样人数继续叠加
            </p>
            <label className="mt-4 block text-sm">
              <span className="text-white/50">需要邀请开通 VIP 的人数</span>
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
          {saved && <p className="admin-alert-ok">已保存</p>}

          <button type="submit" disabled={pending} className="admin-btn admin-btn-primary !h-11">
            {pending ? "保存中…" : "保存配置"}
          </button>
        </form>
      )}
    </AdminShell>
  )
}
