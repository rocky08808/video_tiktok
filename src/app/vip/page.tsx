"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { storeInviteCode } from "@/components/AccountSheet"
import { BrandLogo } from "@/components/BrandLogo"
import { useT } from "@/components/LocaleProvider"
import { fetchClientSettings } from "@/lib/client-settings"
import { DEFAULT_APP_SETTINGS } from "@/lib/settings-types"
import { noteAuthResponse } from "@/lib/session-client"
import {
  formatVipAmount,
  formatVipUntilLabel,
  tgSupportUrl,
  VIP_DURATION_DAYS,
  VIP_NETWORK,
  vipSupportMessage,
  vipUsdtAddress,
} from "@/lib/vip"

export default function VipPage() {
  const t = useT()
  const fallbackAddress = vipUsdtAddress()
  const supportBase = tgSupportUrl()
  const [username, setUsername] = useState<string | null>(null)
  const [vip, setVip] = useState(false)
  const [vipUntil, setVipUntil] = useState<string | null>(null)
  const [amount, setAmount] = useState(DEFAULT_APP_SETTINGS.vipPriceUsdt)
  const [address, setAddress] = useState(fallbackAddress)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteCount, setInviteCount] = useState(0)
  const [inviteVipCount, setInviteVipCount] = useState(0)
  const [inviteNeed, setInviteNeed] = useState(DEFAULT_APP_SETTINGS.inviteNeed)
  const [freeDailyVideos, setFreeDailyVideos] = useState(DEFAULT_APP_SETTINGS.freeDailyVideos)
  const [freeDailyPics, setFreeDailyPics] = useState(DEFAULT_APP_SETTINGS.freeDailyPics)
  const [freeDailyMovies, setFreeDailyMovies] = useState(DEFAULT_APP_SETTINGS.freeDailyMovies)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState<"address" | "invite" | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const supportHref = supportBase
    ? tgSupportUrl(vipSupportMessage({ username, amount }))
    : ""

  useEffect(() => {
    if (!error) return
    const frame = window.requestAnimationFrame(() => {
      const root = mainRef.current
      if (!root) return
      root.scrollTo({ top: root.scrollHeight, behavior: "smooth" })
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [error])

  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get("invite")
      if (code) storeInviteCode(code)
    } catch {
      // ignore
    }
    void fetchClientSettings().then((settings) => {
      setFreeDailyVideos(settings.freeDailyVideos)
      setFreeDailyPics(settings.freeDailyPics)
      setFreeDailyMovies(settings.freeDailyMovies)
      setInviteNeed(settings.inviteNeed)
      setAmount((current) => (current === DEFAULT_APP_SETTINGS.vipPriceUsdt ? settings.vipPriceUsdt : current))
    })
  }, [])

  useEffect(() => {
    if (!address) {
      setQr(null)
      return
    }
    let cancelled = false
    void import("qrcode")
      .then((QR) =>
        QR.toDataURL(address, {
          width: 200,
          margin: 1,
          color: { dark: "#111111", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (!cancelled) setQr(url)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [address])

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/auth/me", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as {
          username?: string | null
          vip?: boolean
          vipUntil?: string | null
          inviteCode?: string | null
          inviteCount?: number
          inviteVipCount?: number
          inviteNeed?: number
          kicked?: boolean
        }
        noteAuthResponse(response, data)
        return data
      })
      .then(async (data) => {
        const name = data.username ?? null
        setUsername(name)
        setInviteCode(typeof data.inviteCode === "string" ? data.inviteCode : null)
        setInviteCount(typeof data.inviteCount === "number" ? data.inviteCount : 0)
        setInviteVipCount(typeof data.inviteVipCount === "number" ? data.inviteVipCount : 0)
        setInviteNeed(
          typeof data.inviteNeed === "number" ? data.inviteNeed : DEFAULT_APP_SETTINGS.inviteNeed,
        )
        setVip(data.vip === true)
        setVipUntil(typeof data.vipUntil === "string" ? data.vipUntil : null)
        if (!name) return
        const orderResponse = await fetch("/api/auth/vip", { signal: controller.signal })
        const order = (await orderResponse.json()) as {
          vip?: boolean
          vipUntil?: string | null
          amount?: number
          address?: string
          error?: string
        }
        if (noteAuthResponse(orderResponse)) {
          setUsername(null)
          setError("账号已在别处登录")
          return
        }
        if (!orderResponse.ok) {
          setError(order.error || "订单创建失败")
          return
        }
        if (order.vip) {
          setVip(true)
          if (typeof order.vipUntil === "string") setVipUntil(order.vipUntil)
        }
        if (typeof order.amount === "number") setAmount(order.amount)
        if (typeof order.address === "string" && order.address) setAddress(order.address)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setError("网络不好，稍后再试")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  async function copyText(kind: "address" | "invite", value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setError(kind === "address" ? "复制失败，请手动选中地址" : "复制失败，请手动复制")
    }
  }

  async function confirmPay() {
    if (pending) return
    if (!username) {
      setError("请先登录")
      return
    }
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/auth/vip", { method: "POST" })
      const data = (await response.json()) as {
        vip?: boolean
        vipUntil?: string | null
        amount?: number
        error?: string
      }
      if (noteAuthResponse(response)) {
        setUsername(null)
        setError("账号已在别处登录")
        return
      }
      if (typeof data.amount === "number") setAmount(data.amount)
      if (!response.ok || !data.vip) {
        setError(data.error || "开通失败")
        return
      }
      setVip(true)
      if (typeof data.vipUntil === "string") setVipUntil(data.vipUntil)
      setDone(true)
    } catch {
      setError("网络不好，稍后再试")
    } finally {
      setPending(false)
    }
  }

  const batchProgress = inviteNeed > 0 ? inviteVipCount % inviteNeed : 0
  const inviteProgress = Math.min(
    1,
    inviteNeed > 0 ? (vip ? batchProgress / inviteNeed : inviteVipCount / inviteNeed) : 0,
  )
  const vipUntilLabel = formatVipUntilLabel(vipUntil)
  const remainForBatch =
    inviteNeed > 0 ? (batchProgress === 0 ? inviteNeed : inviteNeed - batchProgress) : 0

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-[#120e16] text-white">
      <div className="stage relative flex h-dvh w-full flex-col overflow-hidden sm:h-[min(100dvh,860px)] sm:w-[400px] sm:rounded-[28px] sm:ring-1 sm:ring-white/10">
        <header className="relative z-10 flex shrink-0 items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
          <Link href="/" className="grid h-10 w-10 place-items-center text-white/70" aria-label={t("vipPage.back")}>
            ←
          </Link>
          <h1 className="text-sm font-medium tracking-wide text-white/90">
            {vip ? t("vipPage.renew") : t("vipPage.title")}
          </h1>
          <span className="w-10" />
        </header>

        <main
          ref={mainRef}
          className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 [-webkit-overflow-scrolling:touch]"
        >
          <div className="flex flex-col items-center gap-2.5">
            <BrandLogo className="h-12 w-12" />
            <p className="text-[12px] font-medium tracking-[0.28em] text-white/40">瞬看</p>
          </div>
          <p className="mt-3 text-center text-[42px] font-semibold leading-none tracking-tight">
            {formatVipAmount(amount)}
            <span className="ml-2 align-middle text-[15px] font-medium tracking-normal text-white/50">
              USDT
            </span>
          </p>
          <p className="mt-3 text-center text-[13px] text-white/50">无限观看 · 可收藏 · 无限美图</p>
          {vip && vipUntilLabel && !done && (
            <p className="mt-2 text-center text-[12px] text-[#25f4ee]/90">当前 VIP 至 {vipUntilLabel}</p>
          )}

          {loading ? (
            <div className="mt-20 grid place-items-center pb-8">
              <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            </div>
          ) : done ? (
            <div className="mt-14 flex flex-col items-center pb-8">
              <p className="rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] px-3 py-1 text-xs font-semibold">
                {vipUntilLabel ? `已开通至 ${vipUntilLabel}` : "已开通"}
              </p>
              <p className="mt-4 text-sm text-white/55">
                {vipUntilLabel
                  ? `无限观看、收藏，美图已开放 · 有效期至 ${vipUntilLabel}`
                  : "无限观看、收藏，美图也全部开放了"}
              </p>
              <Link
                href="/"
                className="mt-10 grid h-12 w-full place-items-center rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-sm font-semibold shadow-[0_8px_28px_rgba(254,44,85,0.28)]"
              >
                {t("vipPage.backHome")}
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-3.5 pb-5">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-3.5 py-3.5">
                  <p className="text-[12px] text-white/40">普通用户</p>
                  <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-white/70">
                    <li>每天 {freeDailyVideos} 条视频</li>
                    <li>每天 {freeDailyMovies} 部电影</li>
                    <li>不能收藏</li>
                    <li>每天 {freeDailyPics} 张美图</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-[#25f4ee]/20 bg-[linear-gradient(160deg,rgba(254,44,85,0.16),rgba(37,244,238,0.1))] px-3.5 py-3.5">
                  <p className="text-[12px] font-semibold text-[#25f4ee]">VIP</p>
                  <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-white">
                    <li>无限观看</li>
                    <li>无限电影</li>
                    <li>可收藏视频</li>
                    <li>无限美图</li>
                  </ul>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-4">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(37,244,238,0.16),transparent_70%)]"
                />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold">免费升级</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-white/45">
                      {vip
                        ? `每满 ${inviteNeed} 人开通 VIP，叠加 ${VIP_DURATION_DAYS} 天`
                        : `邀请 ${inviteNeed} 人开通 VIP 即可免费获得`}
                    </p>
                  </div>
                  {vip ? (
                    <span className="shrink-0 rounded-full bg-[#25f4ee]/15 px-2 py-1 text-[11px] font-semibold text-[#25f4ee]">
                      可叠加
                    </span>
                  ) : inviteVipCount >= inviteNeed ? (
                    <span className="shrink-0 rounded-full bg-[#25f4ee]/15 px-2 py-1 text-[11px] font-semibold text-[#25f4ee]">
                      已达成
                    </span>
                  ) : null}
                </div>

                <div className="relative mt-3.5 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-black/25 px-3 py-3">
                    <p className="text-[11px] text-white/40">已邀请</p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight">
                      {inviteCount}
                      <span className="ml-1 text-[12px] font-medium text-white/35">人</span>
                    </p>
                  </div>
                  <div className="rounded-xl bg-black/25 px-3 py-3">
                    <p className="text-[11px] text-white/40">已成 VIP</p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight">
                      {inviteVipCount}
                      <span className="ml-1 text-[12px] font-medium text-white/35">/ {inviteNeed}</span>
                    </p>
                  </div>
                </div>

                <div className="relative mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] transition-[width] duration-500 ease-out"
                      style={{
                        width: `${(vip && batchProgress === 0 && inviteVipCount > 0 ? 1 : inviteProgress) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-white/35">
                    {username
                      ? vip
                        ? batchProgress === 0 && inviteVipCount > 0
                          ? `本轮已满，已叠加 ${VIP_DURATION_DAYS} 天`
                          : `再邀 ${remainForBatch} 人开通 VIP，叠加 ${VIP_DURATION_DAYS} 天`
                        : inviteVipCount >= inviteNeed
                          ? "邀请奖励已解锁"
                          : `还差 ${Math.max(0, inviteNeed - inviteVipCount)} 人开通 VIP`
                      : "登录后可查看邀请进度并复制链接"}
                  </p>
                </div>

                {username && inviteCode && (
                  <div className="relative mt-3.5 flex items-center gap-2 rounded-xl bg-black/30 p-1.5 pl-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] tracking-wide text-white/35">邀请码</p>
                      <p className="truncate font-mono text-[15px] font-semibold tracking-[0.12em]">
                        {inviteCode}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`h-10 shrink-0 rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${
                        copied === "invite"
                          ? "bg-[#25f4ee]/20 text-[#25f4ee]"
                          : "bg-gradient-to-r from-[#fe2c55] to-[#25f4ee] text-white"
                      }`}
                      onClick={() =>
                        void copyText("invite", `${window.location.origin}/?invite=${inviteCode}`)
                      }
                    >
                      {copied === "invite" ? "已复制" : "复制链接"}
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold">USDT 转账</p>
                    <p className="mt-1 text-[12px] text-white/40">{VIP_NETWORK} · 金额必须一致</p>
                  </div>
                  <div className="rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold tabular-nums">
                    {formatVipAmount(amount)}
                  </div>
                </div>

                {address ? (
                  <>
                    <div className="mt-4 flex justify-center">
                      <div className="rounded-2xl bg-white p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
                        {qr ? (
                          <img src={qr} alt="收款地址二维码" className="h-40 w-40" />
                        ) : (
                          <div className="grid h-40 w-40 place-items-center text-[12px] text-black/40">
                            生成中…
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-black/30 p-1.5 pl-3">
                      <p className="min-w-0 flex-1 break-all font-mono text-[12px] leading-5 text-white/80">
                        {address}
                      </p>
                      <button
                        type="button"
                        className={`h-10 shrink-0 rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${
                          copied === "address"
                            ? "bg-[#25f4ee]/20 text-[#25f4ee]"
                            : "bg-white/10 text-white"
                        }`}
                        onClick={() => void copyText("address", address)}
                      >
                        {copied === "address" ? "已复制" : "复制"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-[var(--dy)]">
                    还没配置收款地址，先在环境变量里填 NEXT_PUBLIC_VIP_USDT_ADDRESS
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-[#fe2c55]/35 bg-[#fe2c55]/12 px-4 py-3.5">
                <p className="text-[13px] font-semibold text-[#ff8aa3]">转账注意</p>
                <p className="mt-1.5 text-[13px] leading-6 text-white/85">
                  请转账准确金额{" "}
                  <span className="font-semibold text-[#25f4ee]">{formatVipAmount(amount)} USDT</span>（{VIP_NETWORK}
                  ）。金额不对无法自动到账；点确认后会查链，到账才会开通。已转账仍未成功，请联系客服处理。
                </p>
              </div>

              {error && (
                <div ref={errorRef} className="space-y-2.5">
                  <p className="rounded-2xl border border-[#fe2c55]/40 bg-[#fe2c55]/10 px-4 py-3 text-center text-sm leading-6 text-[#ff7a96]">
                    {error}
                  </p>
                  {supportHref && (
                    <a
                      href={supportHref}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-11 items-center justify-center rounded-full border border-[#2AABEE]/45 bg-[#2AABEE]/15 text-sm font-semibold text-[#7ad3ff]"
                    >
                      已转账？联系 Telegram 客服
                    </a>
                  )}
                </div>
              )}

              {!error && supportHref && (
                <a
                  href={supportHref}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-sm text-white/70"
                >
                  已转账未开通？联系客服
                </a>
              )}
            </div>
          )}
        </main>

        {!loading && !done && (
          <div className="relative z-10 shrink-0 border-t border-white/10 bg-[#141018]/92 px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur">
            {!username ? (
              <Link
                href="/?login=1"
                className="grid h-12 w-full place-items-center rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-sm font-semibold shadow-[0_8px_28px_rgba(254,44,85,0.28)]"
              >
                先去登录
              </Link>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  className="h-12 w-full rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-sm font-semibold shadow-[0_8px_28px_rgba(254,44,85,0.28)] disabled:opacity-60"
                  disabled={pending || !address}
                  onClick={() => void confirmPay()}
                >
                  {pending
                    ? "正在查链…"
                    : vip
                      ? `我已转账，确认续费 +${VIP_DURATION_DAYS} 天`
                      : "我已转账，确认开通"}
                </button>
                {supportHref && (
                  <a
                    href={supportHref}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-10 items-center justify-center text-[13px] text-white/45"
                  >
                    联系 Telegram 客服
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
