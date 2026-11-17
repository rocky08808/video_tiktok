import { connection } from "next/server"
import { closeSession } from "@/lib/auth"
import { describeMongoError } from "@/lib/mongo"

export async function POST() {
  await connection()
  try {
    await closeSession()
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
