import { connection } from "next/server"
import { currentUser, readSavedIds, saveUserPicFavorites } from "@/lib/auth"
import { describeMongoError } from "@/lib/mongo"

export async function PUT(request: Request) {
  await connection()
  const user = await currentUser()
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 })
  if (!user.vip) return Response.json({ error: "收藏仅 VIP 可用" }, { status: 403 })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 })
  }
  const savedPicIds = readSavedIds(
    body && typeof body === "object" ? (body as { savedPicIds?: unknown }).savedPicIds : null,
  )
  try {
    const result = await saveUserPicFavorites(user.username, savedPicIds)
    return Response.json(
      { savedPicIds: result.ids, counts: result.counts },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
