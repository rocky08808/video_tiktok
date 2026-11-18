import { getRateLimitsCollection } from "@/lib/mongo"

type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number }

let ready: Promise<void> | null = null

async function rateLimits() {
  const collection = await getRateLimitsCollection()
  if (!ready) {
    ready = Promise.all([
      collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      collection.createIndex({ bucketKey: 1 }, { unique: true }),
    ])
      .then(() => undefined)
      .catch((error: unknown) => {
        ready = null
        throw error
      })
  }
  await ready
  return collection
}

/**
 * 固定窗口计数限流。超限返回 retryAfterSec。
 * key 例：register:ip:1.2.3.4
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const safeKey = key.trim().slice(0, 180)
  if (!safeKey || limit <= 0 || windowMs <= 0) return { ok: true, remaining: limit }

  const now = Date.now()
  const bucket = Math.floor(now / windowMs)
  const bucketKey = `${safeKey}:${bucket}`
  const expiresAt = new Date((bucket + 2) * windowMs)
  const collection = await rateLimits()

  const updated = await collection.findOneAndUpdate(
    { bucketKey },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt, key: safeKey, bucketKey },
    },
    { upsert: true, returnDocument: "after" },
  )

  const count = Math.max(0, Math.round(Number(updated?.count) || 0))
  if (count > limit) {
    const retryAfterSec = Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000))
    return { ok: false, retryAfterSec }
  }
  return { ok: true, remaining: Math.max(0, limit - count) }
}
