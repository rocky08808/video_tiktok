import { connection } from "next/server"
import { currentUser } from "@/lib/auth"
import { getRandomPics } from "@/lib/pics"

export async function GET() {
  await connection()
  const user = await currentUser().catch(() => null)
  const feed = await getRandomPics(user?.vip === true)
  return Response.json(feed, {
    headers: { "Cache-Control": "no-store" },
  })
}
