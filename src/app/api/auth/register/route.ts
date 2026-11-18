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
import { adminCredentials } from "@/lib/admin"
import { clientIp } from "@/lib/client-ip"
import { describeMongoError, getUsersCollection } from "@/lib/mongo"
import { consumeRateLimit } from "@/lib/rate-limit"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** 同一 IP 每小时最多注册 */
const REGISTER_PER_IP_HOUR = 3
/** 同一 IP 每天最多注册 */
const REGISTER_PER_IP_DAY = 8
/** 同一邀请码每天最多带来注册 */
const REGISTER_PER_INVITE_DAY = 50

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
  const adminName = adminCredentials().username
  if (adminName && credentials.usernameKey === adminName.toLocaleLowerCase()) {
    return Response.json({ error: "该用户名不可用" }, { status: 400 })
  }
  const inviteCode =
    body && typeof body === "object" ? (body as { inviteCode?: unknown }).inviteCode : null
  const inviteText =
    typeof inviteCode === "string" && inviteCode.trim() ? inviteCode.trim().slice(0, 32) : ""

  const ip = clientIp(request)
  try {
    const hourLimit = await consumeRateLimit(`register:ip:hour:${ip}`, REGISTER_PER_IP_HOUR, HOUR_MS)
    if (!hourLimit.ok) {
      return Response.json(
        { error: `注册太频繁，请 ${hourLimit.retryAfterSec} 秒后再试` },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(hourLimit.retryAfterSec),
          },
        },
      )
    }
    const dayLimit = await consumeRateLimit(`register:ip:day:${ip}`, REGISTER_PER_IP_DAY, DAY_MS)
    if (!dayLimit.ok) {
      return Response.json(
        { error: "今天注册次数已达上限，请明天再试" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(dayLimit.retryAfterSec),
          },
        },
      )
    }
    if (inviteText) {
      const inviteLimit = await consumeRateLimit(
        `register:invite:day:${inviteText.toLocaleLowerCase()}`,
        REGISTER_PER_INVITE_DAY,
        DAY_MS,
      )
      if (!inviteLimit.ok) {
        return Response.json(
          { error: "该邀请码今日邀请名额已满，请明天再试" },
          {
            status: 429,
            headers: {
              "Cache-Control": "no-store",
              "Retry-After": String(inviteLimit.retryAfterSec),
            },
          },
        )
      }
    }

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
          createdIp: ip,
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
