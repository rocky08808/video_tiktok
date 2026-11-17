import { randomBytes, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { hashToken, openVip } from "@/lib/auth"
import { getSessionsCollection, getUsersCollection } from "@/lib/mongo"

const COOKIE = "sk_admin"
const MAX_AGE = 60 * 60 * 12

export function adminCredentials() {
  const username = process.env.ADMIN_USERNAME?.trim() || ""
  const password = process.env.ADMIN_PASSWORD || ""
  return { username, password }
}

export function adminConfigured() {
  const { username, password } = adminCredentials()
  return username.length >= 2 && password.length >= 6
}

function safeEqualText(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function loginAdmin(username: string, password: string) {
  if (!adminConfigured()) throw new Error("还没配置管理账号")
  const expected = adminCredentials()
  const nameOk = safeEqualText(username.trim().toLocaleLowerCase(), expected.username.toLocaleLowerCase())
  const passOk = safeEqualText(password, expected.password)
  if (!nameOk || !passOk) throw new Error("账号或密码错误")

  const token = randomBytes(32).toString("base64url")
  const sessions = await getSessionsCollection()
  await sessions.insertOne({
    tokenHash: hashToken(token),
    username: expected.username,
    role: "admin",
    expiresAt: new Date(Date.now() + MAX_AGE * 1000),
  })
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  })
  return { username: expected.username }
}

export async function logoutAdmin() {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token) {
    const sessions = await getSessionsCollection()
    await sessions.deleteOne({ tokenHash: hashToken(token), role: "admin" })
  }
  jar.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  })
}

export async function currentAdmin() {
  if (!adminConfigured()) return null
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  const sessions = await getSessionsCollection()
  const session = await sessions.findOne({
    tokenHash: hashToken(token),
    role: "admin",
    expiresAt: { $gt: new Date() },
  })
  if (typeof session?.username !== "string") return null
  return { username: session.username }
}

export async function requireAdmin() {
  const admin = await currentAdmin()
  if (!admin) throw new Error("UNAUTHORIZED")
  return admin
}

export type AdminUserRow = {
  username: string
  vip: boolean
  vipAt: string | null
  vipSource: string | null
  inviteCode: string | null
  invitedBy: string | null
  inviteCount: number
  inviteVipCount: number
  savedCount: number
  likedCount: number
  createdAt: string | null
}

function asDate(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return null
}

export async function listUsers(input: {
  q?: string
  vip?: "all" | "yes" | "no"
  page?: number
  pageSize?: number
}) {
  const users = await getUsersCollection()
  const page = Math.max(1, input.page || 1)
  const pageSize = Math.min(100, Math.max(10, input.pageSize || 20))
  const filter: Record<string, unknown> = {}
  const q = input.q?.trim()
  if (q) {
    filter.$or = [
      { username: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
      { inviteCode: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    ]
  }
  if (input.vip === "yes") filter.vip = true
  if (input.vip === "no") filter.vip = { $ne: true }

  const total = await users.countDocuments(filter)
  const docs = await users
    .find(filter, {
      projection: {
        username: 1,
        vip: 1,
        vipAt: 1,
        vipSource: 1,
        inviteCode: 1,
        invitedBy: 1,
        savedIds: 1,
        likedIds: 1,
        createdAt: 1,
      },
    })
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray()

  const names = docs.map((doc) => (typeof doc.username === "string" ? doc.username : "")).filter(Boolean)
  const inviteAgg =
    names.length === 0
      ? []
      : await users
          .aggregate<{ _id: string; inviteCount: number; inviteVipCount: number }>([
            { $match: { invitedBy: { $in: names } } },
            {
              $group: {
                _id: "$invitedBy",
                inviteCount: { $sum: 1 },
                inviteVipCount: { $sum: { $cond: [{ $eq: ["$vip", true] }, 1, 0] } },
              },
            },
          ])
          .toArray()
  const inviteMap = new Map(
    inviteAgg.map((row) => [row._id, { inviteCount: row.inviteCount, inviteVipCount: row.inviteVipCount }]),
  )

  const items: AdminUserRow[] = docs.flatMap((doc) => {
    if (typeof doc.username !== "string") return []
    const invite = inviteMap.get(doc.username) || { inviteCount: 0, inviteVipCount: 0 }
    return [
      {
        username: doc.username,
        vip: doc.vip === true,
        vipAt: asDate(doc.vipAt),
        vipSource: typeof doc.vipSource === "string" ? doc.vipSource : null,
        inviteCode: typeof doc.inviteCode === "string" ? doc.inviteCode : null,
        invitedBy: typeof doc.invitedBy === "string" ? doc.invitedBy : null,
        inviteCount: invite.inviteCount,
        inviteVipCount: invite.inviteVipCount,
        savedCount: Array.isArray(doc.savedIds) ? doc.savedIds.length : 0,
        likedCount: Array.isArray(doc.likedIds) ? doc.likedIds.length : 0,
        createdAt: asDate(doc.createdAt),
      },
    ]
  })

  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) }
}

export async function setUserVip(username: string, vip: boolean) {
  const key = username.trim()
  if (!key) throw new Error("缺少用户名")
  const users = await getUsersCollection()
  const doc = await users.findOne({ usernameKey: key.toLocaleLowerCase() }, { projection: { username: 1, vip: 1 } })
  if (!doc || typeof doc.username !== "string") throw new Error("用户不存在")
  if (vip) {
    await openVip(doc.username, "admin")
    return { username: doc.username, vip: true }
  }
  await users.updateOne(
    { usernameKey: key.toLocaleLowerCase() },
    { $set: { vip: false, vipAt: null, vipSource: null } },
  )
  return { username: doc.username, vip: false }
}
