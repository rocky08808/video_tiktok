import { connection } from "next/server"
import { getAppSettings } from "@/lib/app-settings"
import { authSnapshot } from "@/lib/auth"
import { describeMongoError } from "@/lib/mongo"

export async function GET() {
  await connection()
  try {
    const settings = await getAppSettings()
    const { user, kicked } = await authSnapshot()
    return Response.json(
      {
        username: user?.username ?? null,
        vip: user?.vip ?? false,
        vipUntil: user?.vipUntil ?? null,
        inviteCode: user?.inviteCode ?? null,
        inviteCount: user?.inviteCount ?? 0,
        inviteVipCount: user?.inviteVipCount ?? 0,
        inviteNeed: user?.inviteNeed ?? settings.inviteNeed,
        freeDailyVideos: user?.freeDailyVideos ?? settings.freeDailyVideos,
        freeDailyPics: user?.freeDailyPics ?? settings.freeDailyPics,
        freeDailyMovies: user?.freeDailyMovies ?? settings.freeDailyMovies,
        savedIds: user?.savedIds ?? [],
        likedIds: user?.likedIds ?? [],
        savedPicIds: user?.savedPicIds ?? [],
        likedPicIds: user?.likedPicIds ?? [],
        savedMovieIds: user?.savedMovieIds ?? [],
        likedMovieIds: user?.likedMovieIds ?? [],
        kicked,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return Response.json(
      { username: null, kicked: false, error: describeMongoError(error) },
      { headers: { "Cache-Control": "no-store" } },
    )
  }
}
