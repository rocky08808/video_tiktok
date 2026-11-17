"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { VIP_NETWORK, VIP_PRICE_USDT, vipUsdtAddress } from "@/lib/vip"

export default function VipPage() {
  const fallbackAddress = vipUsdtAddress()
  const [username, setUsername] = useState<string | null>(null)
  const [vip, setVip] = useState(false)
  const [amount, setAmount] = useState(VIP_PRICE_USDT)
  const [address, setAddress] = useState(fallbackAddress)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/auth/me", { signal: controller.signal })
      .then((response) => response.json() as Promise<{ username?: string | null; vip?: boolean }>)
      .then(async (data) => {
        const name = data.username ?? null
        setUsername(name)
        if (data.vip === true) {
          setVip(true)
          setDone(true)
          return
        }
        if (!name) return
        const orderResponse = await fetch("/api/auth/vip", { signal: controller.signal })
        const order = (await orderResponse.json()) as {
          vip?: boolean
          amount?: number
          address?: string
          error?: string
        }
        if (!orderResponse.ok) {
          setError(order.error || "订单创建失败")
          return
        }
        if (order.vip) {
          setVip(true)
          setDone(true)
          return
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

  async function copyAddress() {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError("复制失败，请手动选中地址")
    }
  }

  async function confirmPay() {
    if (pending || vip) return
    if (!username) {
      setError("请先登录")
      return
    }
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/auth/vip", { method: "POST" })
      const data = (await response.json()) as { vip?: boolean; amount?: number; error?: string }
      if (typeof data.amount === "number") setAmount(data.amount)
      if (!response.ok || !data.vip) {
        setError(data.error || "开通失败")
        return
      }
      setVip(true)
      setDone(true)
    } catch {
      setError("网络不好，稍后再试")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-[#1a1020] text-white">
      <div className="stage relative flex h-dvh w-full flex-col overflow-hidden sm:h-[min(100dvh,860px)] sm:w-[400px] sm:rounded-[28px] sm:shadow-[0_24px_80px_rgba(0,0,0,.45)] sm:ring-1 sm:ring-white/10">
        <header className="relative z-10 flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
          <Link href="/" className="grid h-10 w-10 place-items-center text-white/80" aria-label="返回">
            ←
          </Link>
          <h1 className="text-sm font-medium">开通 VIP</h1>
          <span className="w-10" />
        </header>

        <main className="relative z-10 flex flex-1 flex-col px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-8">
          <p className="text-center text-[13px] tracking-[0.2em] text-white/45">瞬看</p>
          <p className="mt-4 text-center text-4xl font-semibold tracking-tight">
            {amount}
            <span className="ml-2 text-lg font-medium text-white/70">USDT</span>
          </p>
          <p className="mt-3 text-center text-sm text-white/55">收藏只对 VIP 开放</p>

          {loading ? (
            <div className="mt-16 grid flex-1 place-items-start justify-center">
              <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            </div>
          ) : done ? (
            <div className="mt-14 flex flex-1 flex-col items-center">
              <p className="rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] px-3 py-1 text-xs font-semibold">
                已开通
              </p>
              <p className="mt-4 text-sm text-white/60">可以回去收藏视频了</p>
              <Link
                href="/"
                className="mt-10 grid h-11 w-full place-items-center rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-sm font-semibold"
              >
                返回首页
              </Link>
            </div>
          ) : (
            <div className="mt-10 flex flex-1 flex-col">
              <div className="rounded-2xl bg-white/5 px-4 py-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">网络</span>
                  <span className="font-medium">{VIP_NETWORK}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-white/50">金额</span>
                  <span className="font-medium">{amount} USDT</span>
                </div>
                <div className="mt-4">
                  <p className="text-sm text-white/50">收款地址</p>
                  {address ? (
                    <>
                      <p className="mt-2 break-all text-sm leading-6 text-white/90">{address}</p>
                      <button
                        type="button"
                        className="mt-3 h-9 rounded-full border border-white/20 px-4 text-sm text-white/85"
                        onClick={() => void copyAddress()}
                      >
                        {copied ? "已复制" : "复制地址"}
                      </button>
                    </>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-[var(--dy)]">还没配置收款地址，先在环境变量里填 NEXT_PUBLIC_VIP_USDT_ADDRESS</p>
                  )}
                </div>
              </div>

              <p className="mt-4 text-center text-xs leading-5 text-white/40">
                请转账准确金额 {amount} USDT（{VIP_NETWORK}）。点确认后会查链，到账才会开通。
              </p>

              {error && <p className="mt-3 text-center text-sm text-[var(--dy)]">{error}</p>}

              {!username ? (
                <Link
                  href="/"
                  className="mt-auto grid h-11 w-full place-items-center rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-sm font-semibold"
                >
                  先去登录
                </Link>
              ) : (
                <button
                  type="button"
                  className="mt-auto h-11 w-full rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-sm font-semibold disabled:opacity-60"
                  disabled={pending || !address}
                  onClick={() => void confirmPay()}
                >
                  {pending ? "正在查链…" : "我已转账，确认开通"}
                </button>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
