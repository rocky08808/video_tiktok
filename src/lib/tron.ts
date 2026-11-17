import { USDT_TRC20_CONTRACT, vipUsdtAddress } from "@/lib/vip"

export type Trc20Transfer = {
  txId: string
  from: string
  to: string
  amount: number
  at: number
}

type TronGridItem = {
  transaction_id?: string
  from?: string
  to?: string
  value?: string
  block_timestamp?: number
  token_info?: { decimals?: number; address?: string }
}

export async function listUsdtTransfersToVip(limit = 40) {
  const address = vipUsdtAddress()
  if (!address) throw new Error("缺少收款地址")

  const url = new URL(`https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`)
  url.searchParams.set("only_to", "true")
  url.searchParams.set("limit", String(limit))
  url.searchParams.set("contract_address", USDT_TRC20_CONTRACT)

  const headers: HeadersInit = { Accept: "application/json" }
  const key = process.env.TRONGRID_API_KEY?.trim()
  if (key) headers["TRON-PRO-API-KEY"] = key

  const response = await fetch(url, { headers, cache: "no-store" })
  if (!response.ok) {
    throw new Error(`查链失败（${response.status}）`)
  }

  const json = (await response.json()) as { data?: TronGridItem[]; success?: boolean }
  const rows = Array.isArray(json.data) ? json.data : []
  const transfers: Trc20Transfer[] = []

  for (const item of rows) {
    if (typeof item.transaction_id !== "string" || !item.transaction_id) continue
    if (typeof item.to !== "string" || item.to !== address) continue
    if (typeof item.from !== "string" || !item.from) continue
    if (typeof item.value !== "string") continue
    const decimals = Number(item.token_info?.decimals)
    const scale = Number.isFinite(decimals) ? decimals : 6
    const raw = Number(item.value)
    if (!Number.isFinite(raw)) continue
    const amount = raw / 10 ** scale
    const at = Number(item.block_timestamp)
    if (!Number.isFinite(at)) continue
    transfers.push({
      txId: item.transaction_id,
      from: item.from,
      to: item.to,
      amount: Math.round(amount * 1_000_000) / 1_000_000,
      at,
    })
  }

  return transfers
}

export function sameUsdtAmount(left: number, right: number) {
  return Math.abs(left - right) < 0.000001
}
