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
      inviteNeed?: unknown
    }
    const settings = await updateAppSettings({
      freeDailyVideos: typeof body.freeDailyVideos === "number" ? body.freeDailyVideos : undefined,
      freeDailyPics: typeof body.freeDailyPics === "number" ? body.freeDailyPics : undefined,
      inviteNeed: typeof body.inviteNeed === "number" ? body.inviteNeed : undefined,
    })
    return Response.json(settings, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
