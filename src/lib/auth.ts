import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { cookies } from "next/headers"
import { getSessionsCollection, getUsersCollection, getVideoCollection } from "@/lib/mongo"

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
      await sessions.createIndex({ tokenHash: 1 }, { unique: true })
      await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    })().catch((error: unknown) => {
      ready = null
      throw error
    })
  }
  return ready
}

export async function openSession(username: string) {
  const token = randomBytes(32).toString("base64url")
  const sessions = await getSessionsCollection()
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
  if (!Array.isArray(value)) return []
  const ids: string[] = []
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0 || item.length > 200 || ids.includes(item)) continue
    ids.push(item)
    if (ids.length >= 5000) break
  }
  return ids
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
  const doc = await users.findOne({ usernameKey: session.username.toLocaleLowerCase() })
  return { username: session.username, savedIds: readSavedIds(doc?.savedIds), likedIds: readSavedIds(doc?.likedIds) }
}

type IdField = "likedIds" | "savedIds"
type CountField = "likes" | "bookmarks"

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

async function setUserFlag(username: string, field: IdField, id: string, on: boolean) {
  const users = await getUsersCollection()
  const key = username.toLocaleLowerCase()
  const updated = on
    ? await users.findOneAndUpdate({ usernameKey: key, [field]: { $ne: id } }, { $addToSet: { [field]: id } })
    : await users.findOneAndUpdate({ usernameKey: key, [field]: id }, { $pull: { [field]: id } })
  return Boolean(updated)
}

async function syncUserFlags(username: string, field: IdField, countField: CountField, incoming: string[]) {
  await ensureAuthCollections()
  const users = await getUsersCollection()
  const doc = await users.findOne({ usernameKey: username.toLocaleLowerCase() }, { projection: { [field]: 1 } })
  const previousList = readSavedIds(doc?.[field])
  const previous = new Set(previousList)
  const next = readSavedIds(incoming)
  const nextSet = new Set(next)
  const counts: Record<string, number> = {}
  for (const id of next) {
    if (previous.has(id)) continue
    const changed = await setUserFlag(username, field, id, true)
    counts[id] = changed ? await shiftVideoCount(id, countField, 1) : await videoCount(id, countField)
  }
  for (const id of previous) {
    if (nextSet.has(id)) continue
    const changed = await setUserFlag(username, field, id, false)
    counts[id] = changed ? await shiftVideoCount(id, countField, -1) : await videoCount(id, countField)
  }
  const orderChanged = previousList.length !== next.length || previousList.some((id, index) => id !== next[index])
  if (orderChanged) {
    await users.updateOne({ usernameKey: username.toLocaleLowerCase() }, { $set: { [field]: next } })
  }
  return { ids: next, counts }
}

export async function saveUserFavorites(username: string, savedIds: string[]) {
  return syncUserFlags(username, "savedIds", "bookmarks", savedIds)
}

export async function saveUserLikes(username: string, likedIds: string[]) {
  return syncUserFlags(username, "likedIds", "likes", likedIds)
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
