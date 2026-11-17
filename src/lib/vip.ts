export const VIP_PRICE_USDT = 20
/** 在基础价上用 0.001 USDT 步进区分订单，最多 1000 个未完成单 */
export const VIP_AMOUNT_STEP = 0.001
export const VIP_AMOUNT_SLOTS = 1000
export const VIP_NETWORK = "TRC20"
export const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
export const VIP_ORDER_TTL_MS = 1000 * 60 * 60 * 24
export const VIP_FREE_DAILY = 10
export const VIP_PIC_FREE = 20
export const VIP_INVITE_NEED = 5

export function formatVipAmount(amount: number) {
  return (Math.round(amount * 1000) / 1000).toFixed(3)
}

export function vipUsdtAddress() {
  return process.env.NEXT_PUBLIC_VIP_USDT_ADDRESS?.trim() || ""
}

/** Telegram 客服：可填 @username、username 或完整 https://t.me/... */
export function tgSupportUrl(message?: string) {
  const raw = process.env.NEXT_PUBLIC_TG_SUPPORT?.trim() || ""
  if (!raw) return ""
  let url = raw
  if (!/^https?:\/\//i.test(raw)) {
    const user = raw.replace(/^@/, "")
    if (!user) return ""
    url = `https://t.me/${user}`
  }
  if (!message?.trim()) return url
  const join = url.includes("?") ? "&" : "?"
  return `${url}${join}text=${encodeURIComponent(message.trim())}`
}

export function vipSupportMessage(input: { username?: string | null; amount?: number | null }) {
  const name = input.username?.trim() || "未登录"
  const amount =
    typeof input.amount === "number" && Number.isFinite(input.amount)
      ? `${formatVipAmount(input.amount)} USDT`
      : "金额未知"
  return `瞬看 VIP 人工开通\n用户名：${name}\n应付金额：${amount}\n已转账但未自动开通，请协助处理。`
}
