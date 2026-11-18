import { connection } from "next/server"
import { listUsers, requireAdmin, setUserPassword, setUserVip } from "@/lib/admin"
import { describeMongoError } from "@/lib/mongo"

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
    const vipRaw = url.searchParams.get("vip") || "all"
    const vip = vipRaw === "yes" || vipRaw === "no" ? vipRaw : "all"
    const page = Number(url.searchParams.get("page") || "1")
    const pageSize = Number(url.searchParams.get("pageSize") || "20")
    const data = await listUsers({ q, vip, page, pageSize })
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
    const body = (await request.json()) as { username?: unknown; vip?: unknown; password?: unknown }
    const username = typeof body.username === "string" ? body.username : ""
    if (!username) return Response.json({ error: "缺少用户名" }, { status: 400 })

    if (typeof body.password === "string") {
      const result = await setUserPassword(username, body.password)
      return Response.json(result, { headers: { "Cache-Control": "no-store" } })
    }
    if (typeof body.vip === "boolean") {
      const result = await setUserVip(username, body.vip)
      return Response.json(result, { headers: { "Cache-Control": "no-store" } })
    }
    return Response.json({ error: "缺少操作参数" }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message === "用户不存在" || message === "缺少用户名") {
      return Response.json({ error: message }, { status: 404 })
    }
    if (message === "密码至少 6 位") {
      return Response.json({ error: message }, { status: 400 })
    }
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
