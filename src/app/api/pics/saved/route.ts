import { connection } from "next/server"
import { currentUser } from "@/lib/auth"
import { describeMongoError } from "@/lib/mongo"
import { getPicsByIds } from "@/lib/pics"

export async function GET() {
  await connection()
  const user = await currentUser().catch(() => null)
  if (!user) {
    return Response.json({ error: "请先登录", pics: [] }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }
  if (!user.vip) {
    return Response.json(
      { error: "收藏仅 VIP 可用", pics: [] },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    )
  }
  try {
    const result = await getPicsByIds(user.savedPicIds)
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
