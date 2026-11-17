import { connection } from "next/server"
import { logoutAdmin } from "@/lib/admin"

export async function POST() {
  await connection()
  await logoutAdmin()
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
}
