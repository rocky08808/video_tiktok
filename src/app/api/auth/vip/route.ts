import { connection } from "next/server"
import { confirmVipPayment, currentUser, ensurePendingVipOrder } from "@/lib/auth"
import { describeMongoError } from "@/lib/mongo"

export async function GET() {
  await connection()
  const user = await currentUser()
  if (!user) return Response.json({ error: "need_login", code: "need_login" }, { status: 401 })
  try {
    const order = await ensurePendingVipOrder(user.username)
    return Response.json(
      { vip: user.vip, vipUntil: user.vipUntil, ...order },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("缺少收款地址")) {
      return Response.json({ error: "no_address", code: "no_address" }, { status: 503 })
    }
    if (message.includes("充值的人有点多") || /E11000|duplicate key/i.test(message)) {
      return Response.json({ error: "busy", code: "busy" }, { status: 503 })
    }
    return Response.json(
      { error: describeMongoError(error), code: "db_error", detail: describeMongoError(error) },
      { status: 503 },
    )
  }
}

export async function POST() {
  await connection()
  const user = await currentUser()
  if (!user) return Response.json({ error: "need_login", code: "need_login" }, { status: 401 })
  try {
    await ensurePendingVipOrder(user.username)
    const result = await confirmVipPayment(user.username)
    if (!result.ok) {
      return Response.json(
        {
          code: result.code,
          error: result.code,
          amount: "amount" in result ? result.amount : undefined,
          detail: "detail" in result ? result.detail : undefined,
        },
        { status: 402 },
      )
    }
    const refreshed = await currentUser()
    return Response.json(
      {
        vip: true,
        vipUntil: refreshed?.vipUntil ?? null,
        amount: result.amount,
        txId: result.txId,
        orderId: result.orderId,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: number }).code === 11000) {
      return Response.json({ error: "tx_used", code: "tx_used" }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : ""
    if (message.includes("缺少收款地址")) {
      return Response.json({ error: "no_address", code: "no_address" }, { status: 503 })
    }
    if (message.includes("充值的人有点多") || /E11000|duplicate key/i.test(message)) {
      return Response.json({ error: "busy", code: "busy" }, { status: 503 })
    }
    return Response.json(
      { error: describeMongoError(error), code: "db_error", detail: describeMongoError(error) },
      { status: 503 },
    )
  }
}
