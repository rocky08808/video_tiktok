import { connection } from "next/server"
import { currentUser } from "@/lib/auth"
import { describeMongoError } from "@/lib/mongo"

export async function GET() {
  await connection()
  try {
    const user = await currentUser()
    return Response.json(
      {
        username: user?.username ?? null,
        vip: user?.vip ?? false,
        savedIds: user?.savedIds ?? [],
        likedIds: user?.likedIds ?? [],
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return Response.json({ username: null, error: describeMongoError(error) }, { headers: { "Cache-Control": "no-store" } })
  }
}
