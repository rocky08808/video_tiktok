import { connection } from "next/server"
import { describeMongoError } from "@/lib/mongo"
import { getVideosByIds, VIDEO_EXCLUDE_MAX } from "@/lib/videos"

export async function POST(request: Request) {
  await connection()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "请求格式不对", videos: [] }, { status: 400 })
  }
  const ids = Array.isArray((body as { ids?: unknown })?.ids)
    ? ((body as { ids: unknown[] }).ids
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .slice(0, VIDEO_EXCLUDE_MAX))
    : []
  if (ids.length === 0) {
    return Response.json({ videos: [] }, { headers: { "Cache-Control": "no-store" } })
  }
  try {
    const result = await getVideosByIds(ids)
    return Response.json(
      { videos: result.videos, error: result.error },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return Response.json(
      { error: describeMongoError(error), videos: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
