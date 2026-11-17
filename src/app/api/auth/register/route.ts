import { connection } from "next/server"
import {
  ensureAuthCollections,
  hashPassword,
  isDuplicateUser,
  makeInviteCode,
  openSession,
  readCredentials,
  resolveInviter,
} from "@/lib/auth"
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
  const inviteCode =
    body && typeof body === "object" ? (body as { inviteCode?: unknown }).inviteCode : null

  try {
    await ensureAuthCollections()
    const invitedBy = await resolveInviter(inviteCode)
    if (invitedBy && invitedBy.toLocaleLowerCase() === credentials.usernameKey) {
      return Response.json({ error: "不能邀请自己" }, { status: 400 })
    }
    const { salt, passwordHash } = await hashPassword(credentials.password)
    const users = await getUsersCollection()
    let ownInvite = makeInviteCode()
    let inserted = false
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await users.insertOne({
          username: credentials.username,
          usernameKey: credentials.usernameKey,
          passwordHash,
          salt,
          vip: false,
          inviteCode: ownInvite,
          invitedBy: invitedBy || null,
          createdAt: new Date(),
        })
        inserted = true
        break
      } catch (error) {
        if (isDuplicateUser(error) && attempt < 7) {
          const message = error instanceof Error ? error.message : String(error)
          if (/inviteCode/i.test(message)) {
            ownInvite = makeInviteCode()
            continue
          }
        }
        throw error
      }
    }
    if (!inserted) throw new Error("邀请码生成失败")
    await openSession(credentials.username)
    return Response.json(
      { username: credentials.username, vip: false, inviteCode: ownInvite },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    if (isDuplicateUser(error)) {
      return Response.json({ error: "这个用户名已经有人用了" }, { status: 409 })
    }
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
