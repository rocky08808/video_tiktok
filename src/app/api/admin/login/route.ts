import { connection } from "next/server"
import { adminConfigured, loginAdmin } from "@/lib/admin"
import { describeMongoError } from "@/lib/mongo"

export async function POST(request: Request) {
  await connection()
  if (!adminConfigured()) {
    return Response.json({ error: "还没配置 ADMIN_USERNAME / ADMIN_PASSWORD" }, { status: 503 })
  }
  try {
    const body = (await request.json()) as { username?: unknown; password?: unknown }
    const username = typeof body.username === "string" ? body.username : ""
    const password = typeof body.password === "string" ? body.password : ""
    if (!username || !password) {
      return Response.json({ error: "请填写账号和密码" }, { status: 400 })
    }
    const admin = await loginAdmin(username, password)
    return Response.json({ username: admin.username }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message === "账号或密码错误") {
      return Response.json({ error: message }, { status: 401 })
    }
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
