import { connection } from "next/server"
import { getAppSettings, updateAppSettings } from "@/lib/app-settings"
import { requireAdmin } from "@/lib/admin"
import { describeMongoError } from "@/lib/mongo"

export async function GET() {
  await connection()
  try {
    await requireAdmin()
  } catch {
    return Response.json({ error: "请先登录管理后台" }, { status: 401 })
  }
  try {
    const settings = await getAppSettings()
    return Response.json(settings, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  await connection()
  try {
    await requireAdmin()
  } catch {
    return Response.json({ error: "请先登录管理后台" }, { status: 401 })
  }
  try {
    const body = (await request.json()) as {
      freeDailyVideos?: unknown
      freeDailyPics?: unknown
      freeDailyMovies?: unknown
      inviteNeed?: unknown
      vipPriceUsdt?: unknown
    }
    const settings = await updateAppSettings({
      freeDailyVideos: typeof body.freeDailyVideos === "number" ? body.freeDailyVideos : undefined,
      freeDailyPics: typeof body.freeDailyPics === "number" ? body.freeDailyPics : undefined,
      freeDailyMovies: typeof body.freeDailyMovies === "number" ? body.freeDailyMovies : undefined,
      inviteNeed: typeof body.inviteNeed === "number" ? body.inviteNeed : undefined,
      vipPriceUsdt: typeof body.vipPriceUsdt === "number" ? body.vipPriceUsdt : undefined,
    })
    return Response.json(settings, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
