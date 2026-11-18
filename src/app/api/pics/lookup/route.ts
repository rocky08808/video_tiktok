import { connection } from "next/server"
import { describeMongoError } from "@/lib/mongo"
import { getPicsByIds } from "@/lib/pics"

export async function POST(request: Request) {
  await connection()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "请求格式不对", pics: [] }, { status: 400 })
  }
  const ids = Array.isArray((body as { ids?: unknown })?.ids)
    ? ((body as { ids: unknown[] }).ids.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 80))
    : []
  if (ids.length === 0) {
    return Response.json({ pics: [] }, { headers: { "Cache-Control": "no-store" } })
  }
  try {
    const result = await getPicsByIds(ids)
    return Response.json(
      { pics: result.pics, error: result.error },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return Response.json(
      { error: describeMongoError(error), pics: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
