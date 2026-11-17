import { connection } from "next/server"
import {
  ensureAuthCollections,
  hashPassword,
  isDuplicateUser,
  openSession,
  readCredentials,
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

  try {
    await ensureAuthCollections()
    const { salt, passwordHash } = await hashPassword(credentials.password)
    const users = await getUsersCollection()
    await users.insertOne({
      username: credentials.username,
      usernameKey: credentials.usernameKey,
      passwordHash,
      salt,
      vip: false,
      createdAt: new Date(),
    })
    await openSession(credentials.username)
    return Response.json({ username: credentials.username, vip: false }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (isDuplicateUser(error)) {
      return Response.json({ error: "这个用户名已经有人用了" }, { status: 409 })
    }
    return Response.json({ error: describeMongoError(error) }, { status: 503 })
  }
}
