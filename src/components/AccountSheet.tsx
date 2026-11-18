"use client"

import { useEffect, useState, type FormEvent } from "react"
import { fetchClientSettings, readClientSettings } from "@/lib/client-settings"
import { formatVipUntilLabel, VIP_DURATION_DAYS, VIP_INVITE_NEED } from "@/lib/vip"

type User = {
  username: string
  vip: boolean
  vipUntil?: string | null
  inviteCode?: string | null
  inviteCount?: number
  inviteVipCount?: number
  inviteNeed?: number
}

const INVITE_KEY = "sk_invite"

export function readStoredInvite() {
  try {
    return localStorage.getItem(INVITE_KEY)?.trim() || ""
  } catch {
    return ""
  }
}

export function storeInviteCode(code: string) {
  try {
    localStorage.setItem(INVITE_KEY, code.trim())
  } catch {
    // ignore
  }
}

export function AccountSheet({
  open,
  user,
  savedCount,
  onClose,
  onUser,
  onOpenVip,
}: {
  open: boolean
  user: User | null
  savedCount: number
  onClose: () => void
  onUser: (user: User | null) => void
  onOpenVip: () => void
}) {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [inviteHint, setInviteHint] = useState("")

  useEffect(() => {
    if (!open) return
    setInviteHint(readStoredInvite())
    void fetchClientSettings()
  }, [open])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const inviteCode = mode === "register" ? readStoredInvite() : ""
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register" && inviteCode ? { username, password, inviteCode } : { username, password },
        ),
      })
      const data = (await response.json()) as {
        username?: string
        vip?: boolean
        vipUntil?: string | null
        inviteCode?: string
        inviteCount?: number
        inviteVipCount?: number
        inviteNeed?: number
        error?: string
      }
      if (!response.ok || !data.username) {
        setError(data.error || "登录失败")
        return
      }
      setPassword("")
      onUser({
        username: data.username,
        vip: data.vip === true,
        vipUntil: data.vipUntil ?? null,
        inviteCode: data.inviteCode ?? null,
        inviteCount: data.inviteCount ?? 0,
        inviteVipCount: data.inviteVipCount ?? 0,
        inviteNeed: data.inviteNeed ?? VIP_INVITE_NEED,
      })
    } catch {
      setError("网络不好，稍后再试")
    } finally {
      setPending(false)
    }
  }

  async function logout() {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" })
      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        setError(data.error || "退出失败")
        return
      }
      onUser(null)
      setMode("login")
      setPassword("")
    } catch {
      setError("网络不好，稍后再试")
    } finally {
      setPending(false)
    }
  }

  async function copyInvite() {
    if (!user?.inviteCode) return
    const link = `${window.location.origin}/?invite=${user.inviteCode}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError("复制失败，请手动复制")
    }
  }

  const settings = readClientSettings()
  const inviteNeed = user?.inviteNeed ?? settings.inviteNeed ?? VIP_INVITE_NEED
  const inviteCount = user?.inviteCount ?? 0
  const inviteVipCount = user?.inviteVipCount ?? 0
  const batchProgress = inviteNeed > 0 ? inviteVipCount % inviteNeed : 0
  const inviteProgress = Math.min(
    1,
    inviteNeed > 0 ? (user?.vip ? batchProgress / inviteNeed : inviteVipCount / inviteNeed) : 0,
  )
  const vipUntilLabel = formatVipUntilLabel(user?.vipUntil)
  const remainForBatch =
    inviteNeed > 0 ? (batchProgress === 0 && inviteVipCount > 0 && user?.vip ? inviteNeed : inviteNeed - batchProgress) : 0

  return (
    <div inert={!open} className={`absolute inset-0 z-[60] ${open ? "" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label="关闭个人中心"
        className={`absolute inset-0 bg-black/45 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <section
        className={`absolute inset-x-0 bottom-0 mx-auto w-full max-w-[400px] max-h-[min(92dvh,720px)] overflow-y-auto rounded-t-[28px] bg-[#141018] px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] text-white shadow-2xl transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!open}
      >
        <header className="relative grid place-items-center pb-5 pt-1">
          <span className="absolute top-0 h-1 w-10 rounded-full bg-white/20" />
          <h2 className="pt-3 text-sm font-medium tracking-wide text-white/90">
            {user ? "个人中心" : mode === "login" ? "登录" : "注册"}
          </h2>
          <button
            type="button"
            className="absolute right-0 top-2 grid h-8 w-8 place-items-center text-xl leading-none text-white/55"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        {user ? (
          <div className="flex flex-col pb-2">
            <div className="flex items-center gap-3.5">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-xl font-semibold text-white shadow-[0_0_24px_rgba(254,44,85,0.28)]">
                {Array.from(user.username)[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[17px] font-semibold">
                  {user.username}
                  {user.vip && (
                    <span className="shrink-0 rounded-md bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide text-white">
                      VIP
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[13px] leading-snug text-white/45">
                  {user.vip
                    ? vipUntilLabel
                      ? `VIP 至 ${vipUntilLabel} · 已收藏 ${savedCount} 条`
                      : `已收藏 ${savedCount} 条视频`
                    : `每天 ${settings.freeDailyVideos} 条视频 · ${settings.freeDailyPics} 张美图 · VIP 全开放`}
                </p>
              </div>
            </div>

            <div className="relative mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-4">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(37,244,238,0.18),transparent_70%)]"
              />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-white">邀请好友</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/45">
                    {user.vip
                      ? `每满 ${inviteNeed} 位好友开通 VIP，叠加 ${VIP_DURATION_DAYS} 天`
                      : `满 ${inviteNeed} 位好友开通 VIP，你免费升级`}
                  </p>
                </div>
                {user.vip ? (
                  <span className="shrink-0 rounded-full bg-[#25f4ee]/15 px-2 py-1 text-[11px] font-semibold text-[#25f4ee]">
                    可叠加
                  </span>
                ) : inviteVipCount >= inviteNeed ? (
                  <span className="shrink-0 rounded-full bg-[#25f4ee]/15 px-2 py-1 text-[11px] font-semibold text-[#25f4ee]">
                    已达成
                  </span>
                ) : null}
              </div>

              <div className="relative mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-black/25 px-3 py-3">
                  <p className="text-[11px] text-white/40">已邀请</p>
                  <p className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight text-white">
                    {inviteCount}
                    <span className="ml-1 text-[12px] font-medium text-white/35">人</span>
                  </p>
                </div>
                <div className="rounded-xl bg-black/25 px-3 py-3">
                  <p className="text-[11px] text-white/40">好友 VIP</p>
                  <p className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight text-white">
                    {inviteVipCount}
                    <span className="ml-1 text-[12px] font-medium text-white/35">/ {inviteNeed}</span>
                  </p>
                </div>
              </div>

              <div className="relative mt-3.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] transition-[width] duration-500 ease-out"
                    style={{
                      width: `${(user.vip && batchProgress === 0 && inviteVipCount > 0 ? 1 : inviteProgress) * 100}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-white/35">
                  {user.vip
                    ? batchProgress === 0 && inviteVipCount > 0
                      ? `本轮已满，已叠加 ${VIP_DURATION_DAYS} 天，继续邀请可再叠`
                      : `再邀 ${remainForBatch} 人开通 VIP，叠加 ${VIP_DURATION_DAYS} 天`
                    : inviteVipCount >= inviteNeed
                      ? "邀请奖励已解锁"
                      : `还差 ${Math.max(0, inviteNeed - inviteVipCount)} 人开通 VIP`}
                </p>
              </div>

              {user.inviteCode && (
                <div className="relative mt-4 flex items-center gap-2 rounded-xl bg-black/30 p-1.5 pl-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] tracking-wide text-white/35">邀请码</p>
                    <p className="truncate font-mono text-[15px] font-semibold tracking-[0.12em] text-white">
                      {user.inviteCode}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`h-10 shrink-0 rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${
                      copied
                        ? "bg-[#25f4ee]/20 text-[#25f4ee]"
                        : "bg-gradient-to-r from-[#fe2c55] to-[#25f4ee] text-white"
                    }`}
                    onClick={() => void copyInvite()}
                  >
                    {copied ? "已复制" : "复制链接"}
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="mt-4 h-12 w-full rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-sm font-semibold text-white shadow-[0_8px_28px_rgba(254,44,85,0.28)]"
              onClick={onOpenVip}
            >
              {user.vip ? `续费 VIP（+${VIP_DURATION_DAYS} 天）` : "开通 VIP"}
            </button>
            {error && <p className="mt-3 text-center text-sm text-[var(--dy)]">{error}</p>}
            <button
              type="button"
              className="mt-3 h-11 w-full text-sm text-white/40 transition-colors hover:text-white/70 disabled:opacity-60"
              onClick={() => void logout()}
              disabled={pending}
            >
              {pending ? "退出中…" : "退出登录"}
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-3 pb-1" onSubmit={(event) => void submit(event)}>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="用户名"
              className="h-11 rounded-full bg-white/10 px-4 text-sm outline-none placeholder:text-white/35"
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="密码"
              className="h-11 rounded-full bg-white/10 px-4 text-sm outline-none placeholder:text-white/35"
            />
            {mode === "register" && inviteHint && (
              <p className="text-center text-xs text-white/45">将使用邀请码 {inviteHint}</p>
            )}
            {error && <p className="text-sm text-[var(--dy)]">{error}</p>}
            <button
              type="submit"
              className="h-11 rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-sm font-semibold text-white disabled:opacity-60"
              disabled={pending}
            >
              {pending ? "请稍候" : mode === "login" ? "登录" : "注册"}
            </button>
            <button
              type="button"
              className="pb-1 text-sm text-white/60"
              onClick={() => {
                setMode((current) => (current === "login" ? "register" : "login"))
                setError(null)
              }}
            >
              {mode === "login" ? "没有账号？去注册" : "已有账号？去登录"}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
