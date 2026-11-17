import { connection } from "next/server"
import { getVideos } from "@/lib/videos"

export async function GET() {
  await connection()
  const feed = await getVideos()
  return Response.json(feed, {
    headers: { "Cache-Control": "no-store" },
  })
}
