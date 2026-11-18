import { connection } from "next/server"
import { currentUser, readSavedIds, saveUserPicLikes } from "@/lib/auth"
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
  const likedPicIds = readSavedIds(
    body && typeof body === "object" ? (body as { likedPicIds?: unknown }).likedPicIds : null,
  )
  try {
    const result = await saveUserPicLikes(user.username, likedPicIds)
    return Response.json(
      { likedPicIds: result.ids, counts: result.counts },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
