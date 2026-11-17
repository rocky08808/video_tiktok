import { connection } from "next/server"
import { confirmVipPayment, currentUser, ensurePendingVipOrder } from "@/lib/auth"
import { describeMongoError } from "@/lib/mongo"
import { VIP_PRICE_USDT, vipUsdtAddress } from "@/lib/vip"

export async function GET() {
  await connection()
  const user = await currentUser()
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 })
  if (user.vip) {
    return Response.json(
      { vip: true, amount: VIP_PRICE_USDT, address: vipUsdtAddress() },
      { headers: { "Cache-Control": "no-store" } },
    )
  }
  try {
    const order = await ensurePendingVipOrder(user.username)
    return Response.json({ vip: false, ...order }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("缺少收款地址")) {
      return Response.json({ error: "还没配置收款地址" }, { status: 503 })
    }
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}

export async function POST() {
  await connection()
  const user = await currentUser()
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 })
  if (user.vip) {
    return Response.json({ vip: true, amount: VIP_PRICE_USDT }, { headers: { "Cache-Control": "no-store" } })
  }
  try {
    await ensurePendingVipOrder(user.username)
    const result = await confirmVipPayment(user.username)
    if (!result.ok) {
      return Response.json(
        { error: result.error, amount: "amount" in result ? result.amount : undefined },
        { status: 402 },
      )
    }
    return Response.json(
      { vip: true, amount: result.amount, txId: result.txId, orderId: result.orderId },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: number }).code === 11000) {
      return Response.json({ error: "这笔转账已经被用过了" }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : ""
    if (message.includes("缺少收款地址")) {
      return Response.json({ error: "还没配置收款地址" }, { status: 503 })
    }
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
