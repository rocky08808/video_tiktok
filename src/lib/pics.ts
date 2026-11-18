import { ObjectId } from "mongodb"
import { getAppSettings } from "@/lib/app-settings"
import { describeMongoError, getPicsCollection, mongoUri } from "@/lib/mongo"
import { publicBase, resolveSrc } from "@/lib/r2"
import { VIP_PIC_FREE } from "@/lib/vip"

export const PIC_FREE_LIMIT = VIP_PIC_FREE
export const PIC_PAGE_SIZE = 40
/** 单次 exclude 上限（整库去重一轮） */
export const PIC_EXCLUDE_MAX = 50_000

export type PicItem = {
  id: string
  name: string
  src: string
  likes: number
  bookmarks: number
}

export type PicsPageResponse = {
  pics: PicItem[]
  limited: boolean
  freeLimit: number
  hasMore?: boolean
  totalHint?: number
  error?: string
}

type RawPic = {
  _id?: { toString(): string }
  id?: unknown
  name?: unknown
  pic?: unknown
  src?: unknown
  url?: unknown
  likes?: unknown
  bookmarks?: unknown
}

function shuffle<T>(items: T[]) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swap]] = [next[swap], next[index]]
  }
  return next
}

function countOf(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}

function normalizeExclude(exclude: string[] | undefined) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of exclude ?? []) {
    if (typeof raw !== "string") continue
    const id = raw.trim()
    if (!id || id.length > 200) continue
    if (seen.has(id)) {
      const at = out.indexOf(id)
      if (at >= 0) out.splice(at, 1)
    }
    seen.add(id)
    out.push(id)
  }
  return out.length > PIC_EXCLUDE_MAX ? out.slice(-PIC_EXCLUDE_MAX) : out
}

function mapPic(doc: RawPic, base: string): PicItem | null {
  const path =
    (typeof doc.pic === "string" && doc.pic) ||
    (typeof doc.src === "string" && doc.src) ||
    (typeof doc.url === "string" && doc.url) ||
    ""
  const absolute = resolveSrc(path, base)
  if (!absolute) return null
  const name = typeof doc.name === "string" && doc.name ? doc.name : "美图"
  const id =
    (typeof doc.id === "string" && doc.id) ||
    (typeof doc.name === "string" && doc.name) ||
    (doc._id ? String(doc._id) : absolute)
  return {
    id,
    name,
    src: absolute,
    likes: countOf(doc.likes),
    bookmarks: countOf(doc.bookmarks),
  }
}

function excludeMatch(exclude: string[]) {
  if (exclude.length === 0) return null
  const oids = exclude.flatMap((id) => (ObjectId.isValid(id) ? [new ObjectId(id)] : []))
  const clauses: Record<string, unknown>[] = [{ id: { $in: exclude } }, { name: { $in: exclude } }]
  if (oids.length > 0) clauses.push({ _id: { $in: oids } })
  return { $nor: clauses }
}

export async function getPicsByIds(ids: string[], max = 2000) {
  const ordered = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, Math.max(1, max))
  if (ordered.length === 0) return { pics: [] as PicItem[] }
  const base = publicBase()
  if (!mongoUri()) return { pics: [] as PicItem[], error: "缺少 MONGODB_URI" }
  try {
    const collection = await getPicsCollection()
    const or = ordered.flatMap((id) => {
      const parts: Record<string, unknown>[] = [{ id }, { name: id }]
      if (ObjectId.isValid(id)) parts.push({ _id: new ObjectId(id) })
      return parts
    })
    const docs = (await collection.find({ $or: or }).toArray()) as RawPic[]
    const mapped = docs.flatMap((doc) => {
      const item = mapPic(doc, base)
      return item ? [{ item, doc }] : []
    })
    const used = new Set<string>()
    const pics: PicItem[] = []
    for (const id of ordered) {
      const hit = mapped.find(({ item, doc }) => {
        if (used.has(item.id)) return false
        return (
          item.id === id ||
          (typeof doc.name === "string" && doc.name === id) ||
          (doc._id != null && String(doc._id) === id)
        )
      })
      if (!hit) continue
      used.add(hit.item.id)
      pics.push(hit.item)
    }
    return { pics }
  } catch (error) {
    return { pics: [] as PicItem[], error: describeMongoError(error) }
  }
}

export async function getPicsPage(input?: {
  vip?: boolean
  limit?: number
  exclude?: string[]
}): Promise<PicsPageResponse> {
  const settings = await getAppSettings()
  const freeLimit = settings.freeDailyPics
  const vip = input?.vip === true
  const exclude = normalizeExclude(input?.exclude)
  const requested = Math.round(Number(input?.limit))
  const limit = vip
    ? Math.min(100, Math.max(1, Number.isFinite(requested) && requested > 0 ? requested : PIC_PAGE_SIZE))
    : Math.min(freeLimit, Math.max(1, Number.isFinite(requested) && requested > 0 ? requested : freeLimit))
  const base = publicBase()

  if (!mongoUri()) {
    return { pics: [], limited: !vip, freeLimit, hasMore: false, error: "缺少 MONGODB_URI" }
  }

  try {
    const collection = await getPicsCollection()
    const pipeline: Record<string, unknown>[] = []
    const match = excludeMatch(exclude)
    if (match) pipeline.push({ $match: match })
    pipeline.push({ $sample: { size: limit } })
    const docs = (await collection.aggregate(pipeline).toArray()) as RawPic[]
    const mapped = docs.flatMap((doc) => {
      const item = mapPic(doc, base)
      return item ? [item] : []
    })

    if (docs.length > 0 && mapped.length === 0) {
      return {
        pics: [],
        limited: !vip,
        freeLimit,
        hasMore: false,
        error: "pics 有数据，但图片地址拼不出来。需要 NEXT_PUBLIC_R2_PUBLIC_BASE，或把 pic 写成完整 https。",
      }
    }
    if (mapped.length === 0) {
      return {
        pics: [],
        limited: !vip,
        freeLimit,
        hasMore: false,
        error: exclude.length > 0 ? undefined : "pics 集合还是空的",
      }
    }

    const pics = shuffle(mapped)
    return {
      pics,
      limited: !vip,
      freeLimit,
      hasMore: vip && pics.length >= limit,
      totalHint: vip ? pics.length : freeLimit,
    }
  } catch (error) {
    return {
      pics: [],
      limited: !vip,
      freeLimit,
      hasMore: false,
      error: describeMongoError(error),
    }
  }
}

/** @deprecated 使用 getPicsPage */
export async function getRandomPics(vip: boolean) {
  return getPicsPage({ vip })
}
