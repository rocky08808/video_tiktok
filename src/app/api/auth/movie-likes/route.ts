import { connection } from "next/server"
import { currentUser, readSavedIds, saveUserMovieLikes } from "@/lib/auth"
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
  const likedMovieIds = readSavedIds(
    body && typeof body === "object" ? (body as { likedMovieIds?: unknown }).likedMovieIds : null,
  )
  try {
    const result = await saveUserMovieLikes(user.username, likedMovieIds)
    return Response.json(
      { likedMovieIds: result.ids, counts: result.counts },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
