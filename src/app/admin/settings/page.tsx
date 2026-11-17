"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/settings-types"

export default function AdminSettingsPage() {
  const router = useRouter()
  const [adminName, setAdminName] = useState<string | null>(null)
  const [form, setForm] = useState<AppSettings>({ ...DEFAULT_APP_SETTINGS })
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
        setForm({
          freeDailyVideos: settings.freeDailyVideos,
          freeDailyPics: settings.freeDailyPics,
          inviteNeed: settings.inviteNeed,
        })
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setError("网络不好，稍后再试")
        setLoading(false)
      })
    return () => controller.abort()
  }, [router])

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" })
    router.replace("/admin")
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
      setForm({
        freeDailyVideos: data.freeDailyVideos,
        freeDailyPics: data.freeDailyPics,
        inviteNeed: data.inviteNeed,
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } catch {
      setError("网络不好，稍后再试")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-[12px] tracking-[0.2em] text-white/35">瞬看 · ADMIN</p>
          <h1 className="mt-1 text-xl font-semibold">系统配置</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/55">
          <span>{adminName}</span>
          <Link href="/admin/users" className="hover:text-white">
            用户管理
          </Link>
          <Link href="/" className="hover:text-white">
            回首页
          </Link>
          <button type="button" className="hover:text-white" onClick={() => void logout()}>
            退出
          </button>
        </div>
      </header>

      {loading ? (
        <div className="mt-16 grid place-items-center">
          <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm font-semibold text-white">普通用户额度</p>
            <p className="mt-1 text-[12px] text-white/40">按自然日生效；当天已缓存的内容不会立刻重抽</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-white/50">每天视频条数</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={form.freeDailyVideos}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, freeDailyVideos: Number(event.target.value) }))
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#171a21] px-3 outline-none focus:border-white/25"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/50">每天美图张数</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={form.freeDailyPics}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, freeDailyPics: Number(event.target.value) }))
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#171a21] px-3 outline-none focus:border-white/25"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm font-semibold text-white">邀请升级</p>
            <p className="mt-1 text-[12px] text-white/40">邀请好友开通 VIP 达到人数后，邀请人免费成为 VIP</p>
            <label className="mt-4 block text-sm">
              <span className="text-white/50">需要邀请开通 VIP 的人数</span>
              <input
                type="number"
                min={1}
                max={100}
                value={form.inviteNeed}
                onChange={(event) =>
                  setForm((current) => ({ ...current, inviteNeed: Number(event.target.value) }))
                }
                className="mt-2 h-11 w-full max-w-xs rounded-xl border border-white/10 bg-[#171a21] px-3 outline-none focus:border-white/25"
              />
            </label>
          </div>

          {error && <p className="text-sm text-[#ff7a96]">{error}</p>}
          {saved && <p className="text-sm text-[#25f4ee]">已保存</p>}

          <button
            type="submit"
            disabled={pending}
            className="h-11 rounded-xl bg-white px-5 text-sm font-semibold text-black disabled:opacity-60"
          >
            {pending ? "保存中…" : "保存配置"}
          </button>
        </form>
      )}
    </div>
  )
}
