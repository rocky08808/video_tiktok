import { connection } from "next/server"
import { getAppSettings } from "@/lib/app-settings"
import { currentUser } from "@/lib/auth"
import { describeMongoError } from "@/lib/mongo"

export async function GET() {
  await connection()
  try {
    const settings = await getAppSettings()
    const user = await currentUser()
    return Response.json(
      {
        username: user?.username ?? null,
        vip: user?.vip ?? false,
        inviteCode: user?.inviteCode ?? null,
        inviteCount: user?.inviteCount ?? 0,
        inviteVipCount: user?.inviteVipCount ?? 0,
        inviteNeed: user?.inviteNeed ?? settings.inviteNeed,
        freeDailyVideos: user?.freeDailyVideos ?? settings.freeDailyVideos,
        freeDailyPics: user?.freeDailyPics ?? settings.freeDailyPics,
        savedIds: user?.savedIds ?? [],
        likedIds: user?.likedIds ?? [],
        savedPicIds: user?.savedPicIds ?? [],
        likedPicIds: user?.likedPicIds ?? [],
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return Response.json({ username: null, error: describeMongoError(error) }, { headers: { "Cache-Control": "no-store" } })
  }
}
