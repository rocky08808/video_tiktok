import { connection } from "next/server"
import { currentUser, ensureAuthCollections, openSession, readCredentials, verifyPassword } from "@/lib/auth"
import { describeMongoError, getUsersCollection } from "@/lib/mongo"

export async function POST(request: Request) {
  await connection()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 })
  }
  const credentials = readCredentials(body)
  if ("error" in credentials) return Response.json(credentials, { status: 400 })

  try {
    await ensureAuthCollections()
    const users = await getUsersCollection()
    const user = await users.findOne({ usernameKey: credentials.usernameKey })
    const salt = typeof user?.salt === "string" ? user.salt : "sk-missing-user"
    const passwordHash = typeof user?.passwordHash === "string" ? user.passwordHash : "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    const username = typeof user?.username === "string" ? user.username : ""
    const matched = await verifyPassword(credentials.password, salt, passwordHash)
    if (!matched || !username) {
      return Response.json({ error: "用户名或密码不对" }, { status: 401 })
    }
    await openSession(username)
    const me = await currentUser()
    return Response.json(
      {
        username,
        vip: me?.vip === true,
        vipUntil: me?.vipUntil ?? null,
        inviteCode: me?.inviteCode ?? null,
        inviteCount: me?.inviteCount ?? 0,
        inviteVipCount: me?.inviteVipCount ?? 0,
        inviteNeed: me?.inviteNeed,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
