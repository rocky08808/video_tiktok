import { connection } from "next/server"
import {
  cancelVipOrder,
  checkVipOrderPayment,
  listVipOrders,
  markVipOrderPaid,
  requireAdmin,
  type AdminOrderStatus,
} from "@/lib/admin"
import { describeMongoError } from "@/lib/mongo"

const STATUSES = new Set(["all", "pending", "paid", "cancelled", "expired"])

export async function GET(request: Request) {
  await connection()
  try {
    await requireAdmin()
  } catch {
    return Response.json({ error: "请先登录管理后台" }, { status: 401 })
  }
  try {
    const url = new URL(request.url)
    const q = url.searchParams.get("q") || ""
    const statusRaw = url.searchParams.get("status") || "all"
    const status = (STATUSES.has(statusRaw) ? statusRaw : "all") as "all" | AdminOrderStatus
    const page = Number(url.searchParams.get("page") || "1")
    const pageSize = Number(url.searchParams.get("pageSize") || "20")
    const data = await listVipOrders({ q, status, page, pageSize })
    return Response.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  await connection()
  try {
    await requireAdmin()
  } catch {
    return Response.json({ error: "请先登录管理后台" }, { status: 401 })
  }
  try {
    const body = (await request.json()) as {
      id?: unknown
      action?: unknown
      txId?: unknown
      note?: unknown
    }
    const id = typeof body.id === "string" ? body.id.trim() : ""
    const action = typeof body.action === "string" ? body.action : ""
    if (!id) return Response.json({ error: "缺少订单 ID" }, { status: 400 })

    if (action === "cancel") {
      const result = await cancelVipOrder(id)
      return Response.json(result, { headers: { "Cache-Control": "no-store" } })
    }
    if (action === "markPaid") {
      const result = await markVipOrderPaid(id, {
        txId: typeof body.txId === "string" ? body.txId : undefined,
        note: typeof body.note === "string" ? body.note : undefined,
      })
      return Response.json(result, { headers: { "Cache-Control": "no-store" } })
    }
    if (action === "check") {
      const result = await checkVipOrderPayment(id)
      return Response.json(result, { headers: { "Cache-Control": "no-store" } })
    }
    return Response.json({ error: "未知操作" }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (
      message === "订单不存在" ||
      message === "只能取消待支付订单" ||
      message === "只能确认待支付订单" ||
      message === "只能查询待支付订单" ||
      message === "订单缺少用户" ||
      message === "订单金额无效" ||
      message === "订单状态已变更" ||
      message === "还没配置收款地址" ||
      message.includes("查链失败")
    ) {
      const notFound = message === "订单不存在"
      return Response.json({ error: message }, { status: notFound ? 404 : 400 })
    }
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
