import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { ObjectId } from "mongodb"
import { cookies } from "next/headers"
import {
  getMoviesCollection,
  getPicsCollection,
  getSessionsCollection,
  getUsersCollection,
  getVideoCollection,
  getVipOrdersCollection,
} from "@/lib/mongo"
import {
  ensureReactionIndexes,
  listReactionIds,
  normalizeReactionIds,
  syncReactionIds,
  type ReactionKind,
} from "@/lib/reactions"
import { listUsdtTransfersToVip, sameUsdtAmount, type Trc20Transfer } from "@/lib/tron"
import { getAppSettings } from "@/lib/app-settings"
import {
  isVipUntilActive,
  readVipUntil,
  VIP_AMOUNT_SLOTS,
  VIP_AMOUNT_STEP,
  VIP_DURATION_MS,
  VIP_NETWORK,
  VIP_ORDER_TTL_MS,
  VIP_PAYMENT_LOOKBACK_MS,
  vipUsdtAddress,
} from "@/lib/vip"

const scryptAsync = promisify(scrypt)
const COOKIE = "sk_session"
const MAX_AGE = 60 * 60 * 24 * 30

type Credentials = { username: string; usernameKey: string; password: string }

let ready: Promise<void> | null = null

export function readCredentials(body: unknown): Credentials | { error: string } {
  const record = body && typeof body === "object" ? (body as { username?: unknown; password?: unknown }) : {}
  if (typeof record.username !== "string" || typeof record.password !== "string") {
    return { error: "请填写用户名和密码" }
  }
  const username = record.username.trim()
  if (username.length < 2 || username.length > 16 || !/^[\p{L}\p{N}_]+$/u.test(username)) {
    return { error: "用户名用 2 到 16 位中文、字母或数字" }
  }
  if (record.password.length < 6 || record.password.length > 64) {
    return { error: "密码至少 6 位" }
  }
  return { username, usernameKey: username.toLocaleLowerCase(), password: record.password }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url")
  const derived = (await scryptAsync(password, salt, 32)) as Buffer
  return { salt, passwordHash: derived.toString("base64url") }
}

export async function verifyPassword(password: string, salt: string, expected: string) {
  const derived = (await scryptAsync(password, salt, 32)) as Buffer
  const actual = Buffer.from(expected, "base64url")
  if (actual.length !== derived.length) return false
  return timingSafeEqual(actual, derived)
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("base64url")
}

export async function ensureAuthCollections() {
  if (!ready) {
    ready = (async () => {
      const users = await getUsersCollection()
      const sessions = await getSessionsCollection()
      await users.createIndex({ usernameKey: 1 }, { unique: true })
      await users.createIndex({ inviteCode: 1 }, { unique: true, sparse: true })
      await users.createIndex({ invitedBy: 1 })
      await sessions.createIndex({ tokenHash: 1 }, { unique: true })
      await sessions.createIndex({ username: 1 })
      await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
      await ensureReactionIndexes()
    })().catch((error: unknown) => {
      ready = null
      throw error
    })
  }
  return ready
}

export function makeInviteCode() {
  return randomBytes(4).toString("base64url").slice(0, 8)
}

export async function ensureInviteCode(username: string) {
  await ensureAuthCollections()
  const users = await getUsersCollection()
  const key = username.toLocaleLowerCase()
  const doc = await users.findOne({ usernameKey: key }, { projection: { inviteCode: 1 } })
  if (typeof doc?.inviteCode === "string" && doc.inviteCode) return doc.inviteCode
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inviteCode = makeInviteCode()
    try {
      const updated = await users.findOneAndUpdate(
        { usernameKey: key, $or: [{ inviteCode: { $exists: false } }, { inviteCode: null }, { inviteCode: "" }] },
        { $set: { inviteCode } },
        { returnDocument: "after", projection: { inviteCode: 1 } },
      )
      if (typeof updated?.inviteCode === "string" && updated.inviteCode) return updated.inviteCode
      const again = await users.findOne({ usernameKey: key }, { projection: { inviteCode: 1 } })
      if (typeof again?.inviteCode === "string" && again.inviteCode) return again.inviteCode
    } catch (error) {
      if (!isDuplicateUser(error)) throw error
    }
  }
  throw new Error("邀请码生成失败")
}

async function countInviteVip(username: string) {
  const users = await getUsersCollection()
  // 统计曾开通过 VIP 的好友，过期后仍计入邀请达标
  return users.countDocuments({
    invitedBy: username,
    vipAt: { $exists: true, $ne: null },
  })
}

export async function inviteStats(username: string) {
  await ensureAuthCollections()
  const users = await getUsersCollection()
  const inviteCode = await ensureInviteCode(username)
  const inviteVipCount = await countInviteVip(username)
  const inviteCount = await users.countDocuments({ invitedBy: username })
  const settings = await getAppSettings()
  return { inviteCode, inviteCount, inviteVipCount, inviteNeed: settings.inviteNeed }
}

function vipActiveFromDoc(doc: { vip?: unknown; vipUntil?: unknown } | null | undefined) {
  const until = readVipUntil(doc?.vipUntil)
  if (until) return isVipUntilActive(until)
  // 兼容旧数据：仅有 vip=true、尚未写入到期时间
  return doc?.vip === true
}

export async function resolveInviter(inviteCode: unknown) {
  if (typeof inviteCode !== "string") return null
  const code = inviteCode.trim()
  if (!code || code.length > 32) return null
  await ensureAuthCollections()
  const users = await getUsersCollection()
  const inviter = await users.findOne({ inviteCode: code }, { projection: { username: 1 } })
  return typeof inviter?.username === "string" ? inviter.username : null
}

export async function openSession(username: string) {
  const token = randomBytes(32).toString("base64url")
  const sessions = await getSessionsCollection()
  // 单点登录：同一账号只保留最新会话，旧端立刻失效
  await sessions.deleteMany({ username })
  await sessions.insertOne({
    tokenHash: hashToken(token),
    username,
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
  return username
}

export function readSavedIds(value: unknown) {
  return normalizeReactionIds(value)
}

export async function currentUser() {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  await ensureAuthCollections()
  const sessions = await getSessionsCollection()
  const session = await sessions.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  })
  if (typeof session?.username !== "string") return null
  const users = await getUsersCollection()
  const key = session.username.toLocaleLowerCase()
  const doc = await users.findOne({ usernameKey: key })
  let vipUntil = readVipUntil(doc?.vipUntil)
  let vip = vipActiveFromDoc(
    doc ? { vip: doc.vip, vipUntil: doc.vipUntil } : null,
  )
  if (doc?.vip === true && !vipUntil) {
    // 旧永久 VIP → 首次读取时落成 100 天
    vipUntil = new Date(Date.now() + VIP_DURATION_MS)
    await users.updateOne({ usernameKey: key }, { $set: { vipUntil, vip: true } })
    vip = true
  } else if (doc?.vip === true && vipUntil && !isVipUntilActive(vipUntil)) {
    await users.updateOne({ usernameKey: key }, { $set: { vip: false } })
    vip = false
  }
  const inviteCode = await ensureInviteCode(session.username)
  const inviteVipCount = await countInviteVip(session.username)
  const inviteCount = await users.countDocuments({ invitedBy: session.username })
  const settings = await getAppSettings()
  const [savedIds, likedIds, savedPicIds, likedPicIds, savedMovieIds, likedMovieIds] = await Promise.all([
    listReactionIds(key, "video_save"),
    listReactionIds(key, "video_like"),
    listReactionIds(key, "pic_save"),
    listReactionIds(key, "pic_like"),
    listReactionIds(key, "movie_save"),
    listReactionIds(key, "movie_like"),
  ])
  return {
    username: session.username,
    vip,
    vipUntil: vip && vipUntil ? vipUntil.toISOString() : null,
    inviteCode,
    inviteCount,
    inviteVipCount,
    inviteNeed: settings.inviteNeed,
    freeDailyVideos: settings.freeDailyVideos,
    freeDailyPics: settings.freeDailyPics,
    freeDailyMovies: settings.freeDailyMovies,
    savedIds,
    likedIds,
    savedPicIds,
    likedPicIds,
    savedMovieIds,
    likedMovieIds,
  }
}

/** cookie 在但 session 已失效（含被单点顶掉）时 kicked=true，并清掉脏 cookie */
export async function authSnapshot() {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return { user: null, kicked: false }
  const user = await currentUser()
  if (user) return { user, kicked: false }
  jar.delete(COOKIE)
  return { user: null, kicked: true }
}

async function extendVip(
  username: string,
  periods: number,
  source: "pay" | "invite" | "admin",
) {
  await ensureAuthCollections()
  const users = await getUsersCollection()
  const key = username.toLocaleLowerCase()
  const units = Math.max(1, Math.floor(periods))
  const existing = await users.findOne(
    { usernameKey: key },
    { projection: { vip: 1, vipUntil: 1, vipAt: 1 } },
  )
  const now = Date.now()
  const currentUntil = readVipUntil(existing?.vipUntil)
  let start = now
  if (currentUntil && currentUntil.getTime() > now) {
    start = currentUntil.getTime()
  } else if (existing?.vip === true && !currentUntil) {
    // 旧永久 VIP 先保留 100 天，再叠加本次
    start = now + VIP_DURATION_MS
  }
  const vipUntil = new Date(start + VIP_DURATION_MS * units)
  const vipAt =
    existing?.vipAt instanceof Date
      ? existing.vipAt
      : typeof existing?.vipAt === "string" || typeof existing?.vipAt === "number"
        ? new Date(existing.vipAt)
        : new Date(now)
  await users.updateOne(
    { usernameKey: key },
    {
      $set: {
        vip: true,
        vipUntil,
        vipAt: Number.isNaN(vipAt.getTime()) ? new Date(now) : vipAt,
        vipSource: source,
      },
    },
  )
  return vipUntil
}

async function maybeRewardInviter(username: string) {
  const users = await getUsersCollection()
  const user = await users.findOne(
    { usernameKey: username.toLocaleLowerCase() },
    { projection: { invitedBy: 1 } },
  )
  if (typeof user?.invitedBy !== "string" || !user.invitedBy) return
  const settings = await getAppSettings()
  const need = settings.inviteNeed
  if (need <= 0) return
  const inviteVipCount = await countInviteVip(user.invitedBy)
  const batches = Math.floor(inviteVipCount / need)
  if (batches <= 0) return
  const inviterKey = user.invitedBy.toLocaleLowerCase()
  const inviter = await users.findOne(
    { usernameKey: inviterKey },
    { projection: { username: 1, inviteVipGranted: 1 } },
  )
  if (!inviter || typeof inviter.username !== "string") return
  const granted = Math.max(0, Math.floor(Number(inviter.inviteVipGranted) || 0))
  const pending = batches - granted
  if (pending <= 0) return
  await extendVip(inviter.username, pending, "invite")
  await users.updateOne({ usernameKey: inviterKey }, { $max: { inviteVipGranted: batches } })
  await maybeRewardInviter(inviter.username)
}

export async function openVip(
  username: string,
  source: "pay" | "invite" | "admin" = "pay",
  periods = 1,
) {
  await extendVip(username, periods, source)
  await maybeRewardInviter(username)
  return true
}

function amountSlot(amount: number, base: number) {
  return Math.round((Number(amount) - base) / VIP_AMOUNT_STEP)
}

function isDuplicateKey(error: unknown) {
  if (!error || typeof error !== "object") return false
  const code = (error as { code?: number }).code
  if (code === 11000) return true
  const message = error instanceof Error ? error.message : String((error as { message?: unknown }).message || "")
  return /E11000|duplicate key/i.test(message)
}

type VipOrderDoc = {
  _id: ObjectId
  username?: string
  amount?: number
  createdAt?: Date
  status?: string
}

let lastVipSettleAt = 0
const VIP_SETTLE_THROTTLE_MS = 45_000

function orderCreatedMs(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime()
  return Date.now()
}

async function loadPaidTxOwners(txIds: string[]) {
  if (txIds.length === 0) return new Map<string, string>()
  const orders = await getVipOrdersCollection()
  const used = await orders
    .find({ txId: { $in: txIds }, status: "paid" }, { projection: { txId: 1, username: 1 } })
    .toArray()
  return new Map(
    used
      .filter((item) => typeof item.txId === "string")
      .map((item) => [item.txId as string, typeof item.username === "string" ? item.username : ""]),
  )
}

function matchTransferForOrder(
  order: VipOrderDoc,
  address: string,
  transfers: Trc20Transfer[],
  usedBy: Map<string, string>,
) {
  if (typeof order.username !== "string" || !order.username) return null
  if (typeof order.amount !== "number" || !Number.isFinite(order.amount)) return null
  const minAt = orderCreatedMs(order.createdAt) - VIP_PAYMENT_LOOKBACK_MS
  const candidates = transfers.filter(
    (item) => item.to === address && sameUsdtAmount(item.amount, order.amount) && item.at >= minAt,
  )
  return (
    candidates.find((item) => {
      const owner = usedBy.get(item.txId)
      return !owner || owner === order.username
    }) ?? null
  )
}

async function markOrderPaidFromTransfer(order: VipOrderDoc, matched: Trc20Transfer, paySource: string) {
  if (typeof order.username !== "string" || typeof order.amount !== "number") return false
  const orders = await getVipOrdersCollection()
  const updated = await orders.findOneAndUpdate(
    { _id: order._id, status: "pending" },
    {
      $set: {
        status: "paid",
        txId: matched.txId,
        from: matched.from,
        paidAt: new Date(),
        paySource,
      },
    },
    { returnDocument: "after" },
  )
  if (!updated) {
    const again = await orders.findOne({ _id: order._id, status: "paid" })
    if (again) {
      await openVip(order.username)
      return true
    }
    return false
  }
  await openVip(order.username)
  return true
}

/**
 * 扫链认款 pending：付了但没点确认的单尽早绑 txId，避免过期回收金额后被别人误认。
 * 默认 45s 节流；force 用于 cron / 过期结算。
 */
export async function settlePendingVipOrdersFromChain(options?: {
  force?: boolean
  /** 只处理这些订单；默认全部 pending */
  onlyIds?: ObjectId[]
  limit?: number
}) {
  const force = Boolean(options?.force)
  const now = Date.now()
  if (!force && now - lastVipSettleAt < VIP_SETTLE_THROTTLE_MS) {
    return { skipped: true as const, settled: 0, checked: 0 }
  }
  lastVipSettleAt = now

  const address = vipUsdtAddress()
  if (!address) return { skipped: false as const, settled: 0, checked: 0, error: "no_address" as const }

  const orders = await getVipOrdersCollection()
  const filter =
    options?.onlyIds && options.onlyIds.length > 0
      ? { _id: { $in: options.onlyIds }, status: "pending" as const }
      : { status: "pending" as const }
  const pending = (await orders
    .find(filter)
    .sort({ createdAt: 1 })
    .limit(Math.max(1, Math.min(200, options?.limit ?? 80)))
    .toArray()) as VipOrderDoc[]
  if (pending.length === 0) return { skipped: false as const, settled: 0, checked: 0 }

  let transfers: Trc20Transfer[]
  try {
    transfers = await listUsdtTransfersToVip(80)
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    return { skipped: false as const, settled: 0, checked: pending.length, error: "chain_failed" as const, detail: message }
  }

  const usedBy = await loadPaidTxOwners(transfers.map((item) => item.txId))
  let settled = 0
  for (const order of pending) {
    const matched = matchTransferForOrder(order, address, transfers, usedBy)
    if (!matched) continue
    const ok = await markOrderPaidFromTransfer(order, matched, "chain_settle")
    if (ok) {
      settled += 1
      usedBy.set(matched.txId, order.username || "")
    }
  }
  return { skipped: false as const, settled, checked: pending.length }
}

/** 过期前先尝试认款，再把仍未支付的 pending 标 expired，释放金额档位 */
async function expireStaleVipOrders() {
  const orders = await getVipOrdersCollection()
  const cutoff = new Date(Date.now() - VIP_ORDER_TTL_MS)
  const stale = await orders
    .find({ status: "pending", createdAt: { $lte: cutoff } }, { projection: { _id: 1 } })
    .limit(100)
    .toArray()
  if (stale.length > 0) {
    await settlePendingVipOrdersFromChain({
      force: true,
      onlyIds: stale.map((item) => item._id as ObjectId),
      limit: stale.length,
    })
  }
  await orders.updateMany(
    { status: "pending", createdAt: { $lte: cutoff } },
    { $set: { status: "expired", expiredAt: new Date() } },
  )
}

async function nextVipAmount(extraUsed: Set<number> = new Set()) {
  const { vipPriceUsdt: base } = await getAppSettings()
  const orders = await getVipOrdersCollection()
  // 必须与 pending_amount_unique 范围一致：所有 status=pending，不能只看 24h 内
  const pending = await orders.find({ status: "pending" }, { projection: { amount: 1 } }).toArray()
  const used = new Set(extraUsed)
  for (const item of pending) {
    const slot = amountSlot(Number(item.amount), base)
    // slot 0 = 整数基础价，不再新分配；1..SLOTS 为 +0.001 起的偏移档
    if (Number.isFinite(slot) && slot >= 1 && slot <= VIP_AMOUNT_SLOTS) used.add(slot)
  }
  for (let slot = 1; slot <= VIP_AMOUNT_SLOTS; slot += 1) {
    if (!used.has(slot)) {
      return Math.round((base + slot * VIP_AMOUNT_STEP) * 1000) / 1000
    }
  }
  throw new Error("当前充值的人有点多，请稍后再试")
}

export async function ensurePendingVipOrder(username: string) {
  await ensureAuthCollections()
  const address = vipUsdtAddress()
  if (!address) throw new Error("缺少收款地址")
  const orders = await getVipOrdersCollection()
  await orders.createIndex({ txId: 1 }, { unique: true, sparse: true })
  await orders.createIndex({ username: 1, status: 1, createdAt: -1 })
  await orders.createIndex(
    { amount: 1 },
    { unique: true, partialFilterExpression: { status: "pending" }, name: "pending_amount_unique" },
  )

  await expireStaleVipOrders()
  // 顺带扫一下 pending（有节流），付了没点确认的会自动开通
  await settlePendingVipOrdersFromChain().catch(() => null)

  const existing = await orders.findOne({
    username,
    status: "pending",
    createdAt: { $gt: new Date(Date.now() - VIP_ORDER_TTL_MS) },
  })
  if (existing && typeof existing.amount === "number") {
    return {
      orderId: String(existing._id),
      amount: existing.amount,
      address,
      network: VIP_NETWORK,
      currency: "USDT" as const,
    }
  }

  const { vipPriceUsdt: base } = await getAppSettings()
  const blocked = new Set<number>()
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const amount = await nextVipAmount(blocked)
    try {
      const result = await orders.insertOne({
        username,
        amount,
        currency: "USDT",
        network: VIP_NETWORK,
        address,
        status: "pending",
        createdAt: new Date(),
      })
      return {
        orderId: String(result.insertedId),
        amount,
        address,
        network: VIP_NETWORK,
        currency: "USDT" as const,
      }
    } catch (error) {
      if (!isDuplicateKey(error) || attempt >= 11) {
        if (isDuplicateKey(error)) throw new Error("当前充值的人有点多，请稍后再试")
        throw error
      }
      const slot = amountSlot(amount, base)
      if (Number.isFinite(slot)) blocked.add(slot)
      // 可能撞上刚过期尚未清理的单，再清一次
      if (attempt % 3 === 2) await expireStaleVipOrders()
    }
  }
  throw new Error("当前充值的人有点多，请稍后再试")
}

export type VipConfirmFailCode =
  | "no_address"
  | "no_order"
  | "chain_failed"
  | "payment_not_found"
  | "order_expired"

export async function confirmVipPayment(username: string) {
  await ensureAuthCollections()
  const address = vipUsdtAddress()
  if (!address) return { ok: false as const, code: "no_address" as const }

  const orders = await getVipOrdersCollection()
  const order = (await orders.findOne({
    username,
    status: "pending",
    createdAt: { $gt: new Date(Date.now() - VIP_ORDER_TTL_MS) },
  })) as VipOrderDoc | null
  if (!order || typeof order.amount !== "number") {
    return { ok: false as const, code: "no_order" as const }
  }

  let transfers: Trc20Transfer[]
  try {
    transfers = await listUsdtTransfersToVip(50)
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    return { ok: false as const, code: "chain_failed" as const, detail: message || undefined }
  }

  const usedBy = await loadPaidTxOwners(transfers.map((item) => item.txId))
  const matched = matchTransferForOrder(order, address, transfers, usedBy)
  if (!matched) {
    return {
      ok: false as const,
      code: "payment_not_found" as const,
      amount: order.amount,
    }
  }

  const ok = await markOrderPaidFromTransfer(order, matched, "user_confirm")
  if (!ok) return { ok: false as const, code: "order_expired" as const }
  return { ok: true as const, vip: true, amount: order.amount, txId: matched.txId, orderId: String(order._id) }
}

type CountField = "likes" | "bookmarks"

type FlagField = "likedIds" | "savedIds" | "likedPicIds" | "savedPicIds" | "likedMovieIds" | "savedMovieIds"

const FLAG_KIND: Record<FlagField, ReactionKind> = {
  likedIds: "video_like",
  savedIds: "video_save",
  likedPicIds: "pic_like",
  savedPicIds: "pic_save",
  likedMovieIds: "movie_like",
  savedMovieIds: "movie_save",
}

async function videoCount(id: string, field: CountField) {
  const videos = await getVideoCollection()
  const doc = await videos.findOne({ id }, { projection: { [field]: 1 } })
  const value = Number(doc?.[field])
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

async function shiftVideoCount(id: string, field: CountField, delta: 1 | -1) {
  const videos = await getVideoCollection()
  const updated = await videos.findOneAndUpdate(
    { id },
    { $inc: { [field]: delta } },
    { returnDocument: "after", projection: { [field]: 1 } },
  )
  const value = Number(updated?.[field])
  if (!Number.isFinite(value) || value < 0) {
    if (updated) await videos.updateOne({ id }, { $set: { [field]: 0 } })
    return 0
  }
  return Math.round(value)
}

function picFilter(id: string) {
  const key = id.trim()
  const or: Record<string, unknown>[] = [{ id: key }, { name: key }]
  if (ObjectId.isValid(key)) or.push({ _id: new ObjectId(key) })
  return { $or: or }
}

function docCount(doc: { [key: string]: unknown } | null | undefined, field: CountField) {
  const value = Number(doc?.[field])
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

async function picCount(id: string, field: CountField) {
  const pics = await getPicsCollection()
  const doc = await pics.findOne(picFilter(id), { projection: { [field]: 1 } })
  return docCount(doc as { [key: string]: unknown } | null, field)
}

async function shiftPicCount(id: string, field: CountField, delta: 1 | -1) {
  const pics = await getPicsCollection()
  const filter = picFilter(id)
  const updated = await pics.findOneAndUpdate(
    filter,
    { $inc: { [field]: delta } },
    { returnDocument: "after", projection: { [field]: 1 } },
  )
  if (!updated) {
    // 找不到文档时，收藏/点赞仍记在用户上；返回期望展示值避免前端被刷成 0
    return delta > 0 ? 1 : 0
  }
  const value = docCount(updated as { [key: string]: unknown }, field)
  if (value < 0) {
    await pics.updateOne(filter, { $set: { [field]: 0 } })
    return 0
  }
  return value
}

async function movieCount(id: string, field: CountField) {
  const movies = await getMoviesCollection()
  const doc = await movies.findOne({ id }, { projection: { [field]: 1 } })
  return docCount(doc as { [key: string]: unknown } | null, field)
}

async function shiftMovieCount(id: string, field: CountField, delta: 1 | -1) {
  const movies = await getMoviesCollection()
  const updated = await movies.findOneAndUpdate(
    { id },
    { $inc: { [field]: delta } },
    { returnDocument: "after", projection: { [field]: 1 } },
  )
  if (!updated) return delta > 0 ? 1 : 0
  const value = docCount(updated as { [key: string]: unknown }, field)
  if (value < 0) {
    await movies.updateOne({ id }, { $set: { [field]: 0 } })
    return 0
  }
  return value
}

async function syncUserFlags(
  username: string,
  field: FlagField,
  countField: CountField,
  incoming: string[],
  media: "video" | "pic" | "movie",
) {
  await ensureAuthCollections()
  const usernameKey = username.toLocaleLowerCase()
  const bump = media === "pic" ? shiftPicCount : media === "movie" ? shiftMovieCount : shiftVideoCount
  const readCount = media === "pic" ? picCount : media === "movie" ? movieCount : videoCount
  return syncReactionIds(
    usernameKey,
    FLAG_KIND[field],
    incoming,
    (id) => bump(id, countField, 1),
    (id) => bump(id, countField, -1),
    (id) => readCount(id, countField),
  )
}

export async function saveUserFavorites(username: string, savedIds: string[]) {
  return syncUserFlags(username, "savedIds", "bookmarks", savedIds, "video")
}

export async function saveUserLikes(username: string, likedIds: string[]) {
  return syncUserFlags(username, "likedIds", "likes", likedIds, "video")
}

export async function saveUserPicFavorites(username: string, savedPicIds: string[]) {
  return syncUserFlags(username, "savedPicIds", "bookmarks", savedPicIds, "pic")
}

export async function saveUserPicLikes(username: string, likedPicIds: string[]) {
  return syncUserFlags(username, "likedPicIds", "likes", likedPicIds, "pic")
}

export async function saveUserMovieFavorites(username: string, savedMovieIds: string[]) {
  return syncUserFlags(username, "savedMovieIds", "bookmarks", savedMovieIds, "movie")
}

export async function saveUserMovieLikes(username: string, likedMovieIds: string[]) {
  return syncUserFlags(username, "likedMovieIds", "likes", likedMovieIds, "movie")
}

export async function closeSession() {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token) {
    await ensureAuthCollections()
    const sessions = await getSessionsCollection()
    await sessions.deleteOne({ tokenHash: hashToken(token) })
  }
  jar.delete(COOKIE)
}

export function isDuplicateUser(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000
}
