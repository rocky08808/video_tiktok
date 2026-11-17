import { connection } from "next/server"
import { adminConfigured, currentAdmin } from "@/lib/admin"

export async function GET() {
  await connection()
  if (!adminConfigured()) {
    return Response.json(
      { username: null, configured: false, error: "还没配置管理账号" },
      { headers: { "Cache-Control": "no-store" } },
    )
  }
  const admin = await currentAdmin()
  return Response.json(
    { username: admin?.username ?? null, configured: true },
    { headers: { "Cache-Control": "no-store" } },
  )
}
