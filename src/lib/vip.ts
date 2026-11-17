export const VIP_PRICE_USDT = 20
export const VIP_NETWORK = "TRC20"
export const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
export const VIP_ORDER_TTL_MS = 1000 * 60 * 60 * 24

export function vipUsdtAddress() {
  return process.env.NEXT_PUBLIC_VIP_USDT_ADDRESS?.trim() || ""
}
