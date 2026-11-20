"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { storeInviteCode } from "@/components/AccountSheet"
import { BrandLogo } from "@/components/BrandLogo"
import { IconLang } from "@/components/icons"
import { useLocale, useT } from "@/components/LocaleProvider"
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
import type { TranslateFn } from "@/lib/i18n"

function vipApiError(
  t: TranslateFn,
  data: { code?: string; error?: string; amount?: number; detail?: string },
  fallbackKey: string,
) {
  const code = data.code || data.error || ""
  const amountText =
    typeof data.amount === "number" && Number.isFinite(data.amount)
      ? formatVipAmount(data.amount)
      : ""
  switch (code) {
    case "need_login":
      return t("vipPage.errNeedLogin")
    case "no_address":
    case "还没配置收款地址":
      return t("vipPage.errNoAddress")
    case "no_order":
      return t("vipPage.errNoOrder")
    case "chain_failed":
      return data.detail?.trim() || t("vipPage.errChainFailed")
    case "payment_not_found":
      return t("vipPage.errPaymentNotFound", { amount: amountText || "—" })
    case "order_expired":
      return t("vipPage.errOrderExpired")
    case "busy":
      return t("vipPage.errBusy")
    case "tx_used":
      return t("vipPage.errTxUsed")
    case "db_error":
      return data.detail?.trim() || t("vipPage.errDb")
    default:
      break
  }
  if (typeof data.error === "string" && data.error.includes("还没检测到") && amountText) {
    return t("vipPage.errPaymentNotFound", { amount: amountText })
  }
  if (typeof data.error === "string" && /还没检测到\s*([\d.]+)\s*USDT/.test(data.error)) {
    const matched = data.error.match(/还没检测到\s*([\d.]+)\s*USDT/)
    return t("vipPage.errPaymentNotFound", { amount: matched?.[1] || amountText || "—" })
  }
  if (typeof data.error === "string" && data.error.trim() && !/^[a-z_]+$/i.test(data.error)) {
    return data.error
  }
  return t(fallbackKey)
}

export default function VipPage() {
  const t = useT()
  const { locale, setLocale } = useLocale()
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
  const buySteps = t("vipPage.buyUsdtSteps").split("\\n")

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
          code?: string
          detail?: string
        }
        if (noteAuthResponse(orderResponse)) {
          setUsername(null)
          setError(t("feed.kicked"))
          return
        }
        if (!orderResponse.ok) {
          setError(vipApiError(t, order, "vipPage.orderFailed"))
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
        setError(t("account.network"))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
    // 仅首屏拉会话；文案用当时 locale，切语言不重拉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function copyText(kind: "address" | "invite", value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setError(kind === "address" ? t("vipPage.copyAddressFailed") : t("account.copyFailed"))
    }
  }

  async function confirmPay() {
    if (pending) return
    if (!username) {
      setError(t("vipPage.needLogin"))
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
        code?: string
        detail?: string
      }
      if (noteAuthResponse(response)) {
        setUsername(null)
        setError(t("feed.kicked"))
        return
      }
      if (typeof data.amount === "number") setAmount(data.amount)
      if (!response.ok || !data.vip) {
        setError(vipApiError(t, data, "vipPage.activateFailed"))
        return
      }
      setVip(true)
      if (typeof data.vipUntil === "string") setVipUntil(data.vipUntil)
      setDone(true)
    } catch {
      setError(t("account.network"))
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
          <button
            type="button"
            className="grid h-10 w-10 place-items-center text-white/55 transition hover:text-white/85"
            aria-label={locale === "zh" ? t("account.langEn") : t("account.langZh")}
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
          >
            <IconLang className="h-5 w-5" />
          </button>
        </header>

        <main
          ref={mainRef}
          className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 [-webkit-overflow-scrolling:touch]"
        >
          <div className="flex flex-col items-center gap-2.5">
            <BrandLogo className="h-12 w-12" />
            <p className="text-[12px] font-medium tracking-[0.28em] text-white/40">{t("brand")}</p>
          </div>
          <p className="mt-3 text-center text-[42px] font-semibold leading-none tracking-tight">
            {formatVipAmount(amount)}
            <span className="ml-2 align-middle text-[15px] font-medium tracking-normal text-white/50">
              USDT
            </span>
          </p>
          <p className="mt-3 text-center text-[13px] text-white/50">{t("vipPage.tagline")}</p>
          {vip && vipUntilLabel && !done && (
            <p className="mt-2 text-center text-[12px] text-[#25f4ee]/90">
              {t("vipPage.vipUntilNow", { until: vipUntilLabel })}
            </p>
          )}

          {loading ? (
            <div className="mt-20 grid place-items-center pb-8">
              <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            </div>
          ) : done ? (
            <div className="mt-14 flex flex-col items-center pb-8">
              <p className="rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] px-3 py-1 text-xs font-semibold">
                {vipUntilLabel
                  ? t("vipPage.activatedUntil", { until: vipUntilLabel })
                  : t("vipPage.activated")}
              </p>
              <p className="mt-4 text-sm text-white/55">
                {vipUntilLabel
                  ? t("vipPage.activatedHintUntil", { until: vipUntilLabel })
                  : t("vipPage.activatedHint")}
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
                  <p className="text-[12px] text-white/40">{t("vipSheet.freeUser")}</p>
                  <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-white/70">
                    <li>{t("vipSheet.freeVideos", { n: freeDailyVideos })}</li>
                    <li>{t("vipSheet.freeMovies", { n: freeDailyMovies })}</li>
                    <li>{t("vipSheet.noSave")}</li>
                    <li>{t("vipSheet.freePics", { n: freeDailyPics })}</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-[#25f4ee]/20 bg-[linear-gradient(160deg,rgba(254,44,85,0.16),rgba(37,244,238,0.1))] px-3.5 py-3.5">
                  <p className="text-[12px] font-semibold text-[#25f4ee]">{t("vipSheet.vipUser")}</p>
                  <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-white">
                    <li>{t("vipSheet.unlimitedWatch")}</li>
                    <li>{t("vipSheet.unlimitedMovies")}</li>
                    <li>{t("vipSheet.canSave")}</li>
                    <li>{t("vipSheet.unlimitedPics")}</li>
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
                    <p className="text-[15px] font-semibold">{t("vipPage.freeUpgrade")}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-white/45">
                      {vip
                        ? t("account.inviteVipStack", { need: inviteNeed, days: VIP_DURATION_DAYS })
                        : t("vipPage.inviteUnlock", { need: inviteNeed })}
                    </p>
                  </div>
                  {vip ? (
                    <span className="shrink-0 rounded-full bg-[#25f4ee]/15 px-2 py-1 text-[11px] font-semibold text-[#25f4ee]">
                      {t("account.stackable")}
                    </span>
                  ) : inviteVipCount >= inviteNeed ? (
                    <span className="shrink-0 rounded-full bg-[#25f4ee]/15 px-2 py-1 text-[11px] font-semibold text-[#25f4ee]">
                      {t("account.achieved")}
                    </span>
                  ) : null}
                </div>

                <div className="relative mt-3.5 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-black/25 px-3 py-3">
                    <p className="text-[11px] text-white/40">{t("account.invited")}</p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight">
                      {inviteCount}
                      {t("account.people") ? (
                        <span className="ml-1 text-[12px] font-medium text-white/35">{t("account.people")}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="rounded-xl bg-black/25 px-3 py-3">
                    <p className="text-[11px] text-white/40">{t("vipPage.becameVip")}</p>
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
                          ? t("vipPage.roundFullShort", { days: VIP_DURATION_DAYS })
                          : t("account.needMore", { n: remainForBatch, days: VIP_DURATION_DAYS })
                        : inviteVipCount >= inviteNeed
                          ? t("account.unlocked")
                          : t("account.needVipFriends", { n: Math.max(0, inviteNeed - inviteVipCount) })
                      : t("vipPage.loginInviteHint")}
                  </p>
                </div>

                {username && inviteCode && (
                  <div className="relative mt-3.5 flex items-center gap-2 rounded-xl bg-black/30 p-1.5 pl-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] tracking-wide text-white/35">{t("account.inviteCode")}</p>
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
                      {copied === "invite" ? t("account.copied") : t("vipPage.copyInvite")}
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold">{t("vipPage.payTitle")}</p>
                    <p className="mt-1 text-[12px] text-white/40">
                      {t("vipPage.payHint", { network: VIP_NETWORK })}
                    </p>
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
                          <img src={qr} alt={t("vipPage.qrAlt")} className="h-40 w-40" />
                        ) : (
                          <div className="grid h-40 w-40 place-items-center text-[12px] text-black/40">
                            {t("vipPage.qrPending")}
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
                        {copied === "address" ? t("vipPage.copied") : t("vipPage.copyAddress")}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-[var(--dy)]">{t("vipPage.noAddress")}</p>
                )}
              </div>

              <div className="rounded-2xl border border-[#25f4ee]/20 bg-[linear-gradient(160deg,rgba(37,244,238,0.08),rgba(37,244,238,0.03))] px-4 py-3.5">
                <p className="text-[13px] font-semibold text-[#25f4ee]">{t("vipPage.buyUsdtTitle")}</p>
                <p className="mt-1.5 text-[12px] leading-6 text-white/75">
                  {buySteps.map((step, i) => (
                    <span key={i}>
                      {step}
                      {i < buySteps.length - 1 && <br />}
                    </span>
                  ))}
                </p>
                <p className="mt-1.5 text-[11px] leading-5 text-[#25f4ee]/70">{t("vipPage.buyUsdtTip")}</p>
              </div>

              <div className="rounded-2xl border border-[#fe2c55]/35 bg-[#fe2c55]/12 px-4 py-3.5">
                <p className="text-[13px] font-semibold text-[#ff8aa3]">{t("vipPage.cautionTitle")}</p>
                <p className="mt-1.5 text-[13px] leading-6 text-white/85">
                  {t("vipPage.cautionBody", {
                    amount: formatVipAmount(amount),
                    network: VIP_NETWORK,
                  })}
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
                      {t("vipPage.supportPaid")}
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
                  {t("vipPage.supportUnpaid")}
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
                {t("vipPage.goLogin")}
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
                    ? t("vipPage.checkingChain")
                    : vip
                      ? t("vipPage.confirmRenew", { days: VIP_DURATION_DAYS })
                      : t("vipPage.confirmOpen")}
                </button>
                {supportHref && (
                  <a
                    href={supportHref}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-10 items-center justify-center text-[13px] text-white/45"
                  >
                    {t("vipPage.tgSupport")}
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
