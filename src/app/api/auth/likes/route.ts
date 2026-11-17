import { connection } from "next/server"
import { currentUser, readSavedIds, saveUserLikes } from "@/lib/auth"
import { describeMongoError } from "@/lib/mongo"

export async function PUT(request: Request) {
  await connection()
  const user = await currentUser()
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 })
  }
  const likedIds = readSavedIds(body && typeof body === "object" ? (body as { likedIds?: unknown }).likedIds : null)
  try {
    const result = await saveUserLikes(user.username, likedIds)
    return Response.json(
      { likedIds: result.ids, counts: result.counts },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
