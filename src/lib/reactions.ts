import {
  getUserReactionsCollection,
  getUsersCollection,
} from "@/lib/mongo"

export type ReactionKind = "video_like" | "video_save" | "pic_like" | "pic_save"

/** 单次同步请求上限，防恶意超大 body；库内条数不设硬顶 */
export const REACTION_SYNC_MAX = 50_000

const KIND_TO_LEGACY: Record<ReactionKind, string> = {
  video_like: "likedIds",
  video_save: "savedIds",
  pic_like: "likedPicIds",
  pic_save: "savedPicIds",
}

export function normalizeReactionIds(value: unknown, max = REACTION_SYNC_MAX) {
  if (!Array.isArray(value)) return [] as string[]
  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== "string") continue
    const id = item.trim()
    if (!id || id.length > 200 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
    if (ids.length >= max) break
  }
  return ids
}

export async function ensureReactionIndexes() {
  const reactions = await getUserReactionsCollection()
  await reactions.createIndex({ usernameKey: 1, kind: 1, targetId: 1 }, { unique: true })
  await reactions.createIndex({ usernameKey: 1, kind: 1, seq: 1 })
}

async function migrateLegacyIds(usernameKey: string, kind: ReactionKind) {
  const legacyField = KIND_TO_LEGACY[kind]
  const users = await getUsersCollection()
  const doc = await users.findOne(
    { usernameKey },
    { projection: { [legacyField]: 1 } },
  )
  const legacy = normalizeReactionIds(doc?.[legacyField])
  if (legacy.length === 0) return

  const reactions = await getUserReactionsCollection()
  const existing = await reactions
    .find({ usernameKey, kind }, { projection: { targetId: 1 } })
    .toArray()
  const have = new Set(
    existing.map((row) => (typeof row.targetId === "string" ? row.targetId : "")).filter(Boolean),
  )
  const missing = legacy.filter((id) => !have.has(id))
  if (missing.length > 0) {
    const baseSeq = existing.length
    const now = new Date()
    await reactions.insertMany(
      missing.map((targetId, index) => ({
        usernameKey,
        kind,
        targetId,
        seq: baseSeq + index,
        updatedAt: now,
      })),
      { ordered: false },
    ).catch(() => {
      // 并发迁移时可能撞 unique，忽略
    })
  }
  await users.updateOne({ usernameKey }, { $unset: { [legacyField]: "" } })
}

export async function listReactionIds(usernameKey: string, kind: ReactionKind) {
  await migrateLegacyIds(usernameKey, kind)
  const reactions = await getUserReactionsCollection()
  const docs = await reactions
    .find({ usernameKey, kind }, { projection: { targetId: 1, seq: 1 } })
    .sort({ seq: 1 })
    .toArray()
  return docs.flatMap((doc) => (typeof doc.targetId === "string" && doc.targetId ? [doc.targetId] : []))
}

export async function countReactions(usernameKey: string, kind: ReactionKind) {
  await migrateLegacyIds(usernameKey, kind)
  const reactions = await getUserReactionsCollection()
  return reactions.countDocuments({ usernameKey, kind })
}

export async function countReactionsForUsers(usernameKeys: string[], kind: ReactionKind) {
  if (usernameKeys.length === 0) return new Map<string, number>()
  const reactions = await getUserReactionsCollection()
  const rows = await reactions
    .aggregate<{ _id: string; count: number }>([
      { $match: { usernameKey: { $in: usernameKeys }, kind } },
      { $group: { _id: "$usernameKey", count: { $sum: 1 } } },
    ])
    .toArray()
  return new Map(rows.map((row) => [row._id, row.count]))
}

export async function syncReactionIds(
  usernameKey: string,
  kind: ReactionKind,
  incoming: string[],
  onAdd: (id: string) => Promise<number>,
  onRemove: (id: string) => Promise<number>,
  onRead: (id: string) => Promise<number>,
) {
  await migrateLegacyIds(usernameKey, kind)
  const reactions = await getUserReactionsCollection()
  const previousDocs = await reactions
    .find({ usernameKey, kind }, { projection: { targetId: 1, seq: 1 } })
    .sort({ seq: 1 })
    .toArray()
  const previousList = previousDocs.flatMap((doc) =>
    typeof doc.targetId === "string" && doc.targetId ? [doc.targetId] : [],
  )
  const previous = new Set(previousList)
  const next = normalizeReactionIds(incoming)
  const nextSet = new Set(next)
  const counts: Record<string, number> = {}

  for (const id of next) {
    if (previous.has(id)) continue
    try {
      const wrote = await reactions.updateOne(
        { usernameKey, kind, targetId: id },
        {
          $setOnInsert: {
            usernameKey,
            kind,
            targetId: id,
            seq: next.indexOf(id),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      )
      counts[id] = wrote.upsertedCount > 0 ? await onAdd(id) : await onRead(id)
    } catch {
      counts[id] = await onRead(id)
    }
  }

  for (const id of previous) {
    if (nextSet.has(id)) continue
    const removed = await reactions.deleteOne({ usernameKey, kind, targetId: id })
    counts[id] = removed.deletedCount > 0 ? await onRemove(id) : await onRead(id)
  }

  const orderChanged =
    previousList.length !== next.length || previousList.some((id, index) => id !== next[index])
  if (orderChanged && next.length > 0) {
    const now = new Date()
    await reactions.bulkWrite(
      next.map((targetId, seq) => ({
        updateOne: {
          filter: { usernameKey, kind, targetId },
          update: {
            $set: { usernameKey, kind, targetId, seq, updatedAt: now },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    )
  }

  return { ids: next, counts }
}
