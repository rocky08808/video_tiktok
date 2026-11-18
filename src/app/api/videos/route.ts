import { connection } from "next/server"
import { getVideos, VIDEO_FEED_CACHE_TTL_MS } from "@/lib/videos"

export async function GET() {
  await connection()
  const feed = await getVideos()
  const maxAge = Math.max(1, Math.round(VIDEO_FEED_CACHE_TTL_MS / 1000))
  return Response.json(feed, {
    headers: {
      // 边缘/浏览器短缓存；进程内另有 45s 内存缓存，避免每次打 Mongo
      "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
    },
  })
}
