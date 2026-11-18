import { randomBytes, timingSafeEqual } from "node:crypto"
import { ObjectId } from "mongodb"
import { cookies } from "next/headers"
import { hashPassword, hashToken, openVip } from "@/lib/auth"
import { isVipUntilActive, readVipUntil } from "@/lib/vip"
import { getSessionsCollection, getUsersCollection, getVipOrdersCollection } from "@/lib/mongo"
import { listUsdtTransfersToVip, sameUsdtAmount } from "@/lib/tron"
import { formatVipAmount, VIP_ORDER_TTL_MS, vipUsdtAddress } from "@/lib/vip"

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
  vipUntil: string | null
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
  const now = new Date()
  const clauses: Record<string, unknown>[] = []
  const q = input.q?.trim()
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    clauses.push({
      $or: [
        { username: { $regex: safe, $options: "i" } },
        { inviteCode: { $regex: safe, $options: "i" } },
      ],
    })
  }
  const activeVip = {
    $or: [
      { vipUntil: { $gt: now } },
      { vip: true, vipUntil: { $exists: false } },
      { vip: true, vipUntil: null },
    ],
  }
  if (input.vip === "yes") clauses.push(activeVip)
  if (input.vip === "no") clauses.push({ $nor: activeVip.$or })
  const filter: Record<string, unknown> =
    clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0]! : { $and: clauses }

  const total = await users.countDocuments(filter)
  const docs = await users
    .find(filter, {
      projection: {
        username: 1,
        vip: 1,
        vipAt: 1,
        vipUntil: 1,
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
                inviteVipCount: {
                  $sum: {
                    $cond: [{ $and: [{ $ne: ["$vipAt", null] }, { $ifNull: ["$vipAt", false] }] }, 1, 0],
                  },
                },
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
    const until = readVipUntil(doc.vipUntil)
    const vip = until ? isVipUntilActive(until) : doc.vip === true
    return [
      {
        username: doc.username,
        vip,
        vipAt: asDate(doc.vipAt),
        vipUntil: asDate(doc.vipUntil),
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
    { $set: { vip: false, vipAt: null, vipUntil: null, vipSource: null } },
  )
  return { username: doc.username, vip: false }
}

export async function setUserPassword(username: string, password: string) {
  const key = username.trim()
  if (!key) throw new Error("缺少用户名")
  if (password.length < 6 || password.length > 64) throw new Error("密码至少 6 位")
  const users = await getUsersCollection()
  const doc = await users.findOne({ usernameKey: key.toLocaleLowerCase() }, { projection: { username: 1 } })
  if (!doc || typeof doc.username !== "string") throw new Error("用户不存在")
  const { salt, passwordHash } = await hashPassword(password)
  await users.updateOne(
    { usernameKey: key.toLocaleLowerCase() },
    { $set: { salt, passwordHash, passwordUpdatedAt: new Date(), passwordUpdatedBy: "admin" } },
  )
  return { username: doc.username, ok: true as const }
}

export type AdminOrderStatus = "pending" | "paid" | "cancelled" | "expired"

export type AdminOrderRow = {
  id: string
  username: string
  amount: number
  amountText: string
  currency: string
  network: string
  address: string | null
  status: AdminOrderStatus
  rawStatus: string
  txId: string | null
  from: string | null
  createdAt: string | null
  paidAt: string | null
}

function orderCreatedAt(value: unknown) {
  if (value instanceof Date) return value
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function resolveOrderStatus(status: unknown, createdAt: unknown): AdminOrderStatus {
  const raw = typeof status === "string" ? status : "pending"
  if (raw === "paid") return "paid"
  if (raw === "cancelled") return "cancelled"
  if (raw === "pending") {
    const created = orderCreatedAt(createdAt)
    if (created && Date.now() - created.getTime() > VIP_ORDER_TTL_MS) return "expired"
    return "pending"
  }
  return raw === "expired" ? "expired" : "cancelled"
}

export async function listVipOrders(input: {
  q?: string
  status?: "all" | AdminOrderStatus
  page?: number
  pageSize?: number
}) {
  const orders = await getVipOrdersCollection()
  const page = Math.max(1, input.page || 1)
  const pageSize = Math.min(100, Math.max(10, input.pageSize || 20))
  const filter: Record<string, unknown> = {}
  const q = input.q?.trim()
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const amount = Number(q)
    const or: Record<string, unknown>[] = [
      { username: { $regex: safe, $options: "i" } },
      { txId: { $regex: safe, $options: "i" } },
      { from: { $regex: safe, $options: "i" } },
    ]
    if (Number.isFinite(amount) && amount > 0) or.push({ amount })
    if (ObjectId.isValid(q)) or.push({ _id: new ObjectId(q) })
    filter.$or = or
  }

  const expiredBefore = new Date(Date.now() - VIP_ORDER_TTL_MS)
  const status = input.status || "all"
  if (status === "paid") filter.status = "paid"
  else if (status === "cancelled") filter.status = "cancelled"
  else if (status === "pending") {
    filter.status = "pending"
    filter.createdAt = { $gt: expiredBefore }
  } else if (status === "expired") {
    filter.status = "pending"
    filter.createdAt = { $lte: expiredBefore }
  }

  const total = await orders.countDocuments(filter)
  const docs = await orders
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray()

  const items: AdminOrderRow[] = docs.map((doc) => {
    const amount = Number(doc.amount)
    const resolved = resolveOrderStatus(doc.status, doc.createdAt)
    return {
      id: String(doc._id),
      username: typeof doc.username === "string" ? doc.username : "—",
      amount: Number.isFinite(amount) ? amount : 0,
      amountText: Number.isFinite(amount) ? formatVipAmount(amount) : "—",
      currency: typeof doc.currency === "string" ? doc.currency : "USDT",
      network: typeof doc.network === "string" ? doc.network : "TRC20",
      address: typeof doc.address === "string" ? doc.address : null,
      status: resolved,
      rawStatus: typeof doc.status === "string" ? doc.status : "pending",
      txId: typeof doc.txId === "string" ? doc.txId : null,
      from: typeof doc.from === "string" ? doc.from : null,
      createdAt: asDate(doc.createdAt),
      paidAt: asDate(doc.paidAt),
    }
  })

  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) }
}

export async function cancelVipOrder(orderId: string) {
  if (!ObjectId.isValid(orderId)) throw new Error("订单不存在")
  const orders = await getVipOrdersCollection()
  const updated = await orders.findOneAndUpdate(
    { _id: new ObjectId(orderId), status: "pending" },
    { $set: { status: "cancelled", cancelledAt: new Date(), cancelSource: "admin" } },
    { returnDocument: "after" },
  )
  if (!updated) throw new Error("只能取消待支付订单")
  return { id: String(updated._id), status: "cancelled" as const }
}

export async function markVipOrderPaid(orderId: string, input?: { txId?: string; note?: string }) {
  if (!ObjectId.isValid(orderId)) throw new Error("订单不存在")
  const orders = await getVipOrdersCollection()
  const order = await orders.findOne({ _id: new ObjectId(orderId) })
  if (!order) throw new Error("订单不存在")
  if (order.status === "paid") {
    if (typeof order.username === "string") await openVip(order.username, "admin")
    return { id: String(order._id), status: "paid" as const, username: order.username }
  }
  if (order.status !== "pending") throw new Error("只能确认待支付订单")
  if (typeof order.username !== "string" || !order.username) throw new Error("订单缺少用户")

  const txId = input?.txId?.trim() || `admin:${orderId}`
  const updated = await orders.findOneAndUpdate(
    { _id: order._id, status: "pending" },
    {
      $set: {
        status: "paid",
        txId,
        paidAt: new Date(),
        paySource: "admin",
        adminNote: input?.note?.trim() || null,
      },
    },
    { returnDocument: "after" },
  )
  if (!updated) throw new Error("订单状态已变更")
  await openVip(order.username, "admin")
  return { id: String(updated._id), status: "paid" as const, username: order.username, txId }
}

/** 按订单查链：到账则自动开通；未到账返回 found:false */
export async function checkVipOrderPayment(orderId: string) {
  if (!ObjectId.isValid(orderId)) throw new Error("订单不存在")
  const address = vipUsdtAddress()
  if (!address) throw new Error("还没配置收款地址")

  const orders = await getVipOrdersCollection()
  const order = await orders.findOne({ _id: new ObjectId(orderId) })
  if (!order) throw new Error("订单不存在")
  if (order.status === "paid") {
    if (typeof order.username === "string") await openVip(order.username, "admin")
    return {
      found: true as const,
      id: String(order._id),
      status: "paid" as const,
      username: order.username,
      amount: Number(order.amount),
      txId: typeof order.txId === "string" ? order.txId : null,
      message: "订单已是已支付",
    }
  }
  if (order.status !== "pending") throw new Error("只能查询待支付订单")
  if (typeof order.username !== "string" || !order.username) throw new Error("订单缺少用户")
  if (typeof order.amount !== "number" || !Number.isFinite(order.amount)) throw new Error("订单金额无效")

  const created = orderCreatedAt(order.createdAt)
  const minAt = (created?.getTime() ?? Date.now()) - 3 * 60 * 1000
  let transfers
  try {
    transfers = await listUsdtTransfersToVip(80)
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    throw new Error(message || "查链失败，稍后再试")
  }

  const candidates = transfers.filter(
    (item) => item.to === address && sameUsdtAmount(item.amount, order.amount) && item.at >= minAt,
  )
  const used = await orders
    .find(
      { txId: { $in: candidates.map((item) => item.txId) }, status: "paid" },
      { projection: { txId: 1, username: 1 } },
    )
    .toArray()
  const usedBy = new Map(
    used
      .filter((item) => typeof item.txId === "string")
      .map((item) => [item.txId as string, typeof item.username === "string" ? item.username : ""]),
  )
  const matched = candidates.find((item) => {
    const owner = usedBy.get(item.txId)
    return !owner || owner === order.username
  })

  if (!matched) {
    return {
      found: false as const,
      id: String(order._id),
      status: "pending" as const,
      username: order.username,
      amount: order.amount,
      message: `未检测到 ${formatVipAmount(order.amount)} USDT 到账`,
    }
  }

  const updated = await orders.findOneAndUpdate(
    { _id: order._id, status: "pending" },
    {
      $set: {
        status: "paid",
        txId: matched.txId,
        from: matched.from,
        paidAt: new Date(),
        paySource: "chain",
      },
    },
    { returnDocument: "after" },
  )
  if (!updated) {
    const again = await orders.findOne({ _id: order._id, status: "paid" })
    if (again) {
      await openVip(order.username, "admin")
      return {
        found: true as const,
        id: String(order._id),
        status: "paid" as const,
        username: order.username,
        amount: order.amount,
        txId: typeof again.txId === "string" ? again.txId : matched.txId,
        message: "已到账并开通 VIP",
      }
    }
    throw new Error("订单状态已变更")
  }

  await openVip(order.username, "admin")
  return {
    found: true as const,
    id: String(updated._id),
    status: "paid" as const,
    username: order.username,
    amount: order.amount,
    txId: matched.txId,
    message: "已到账并开通 VIP",
  }
}
