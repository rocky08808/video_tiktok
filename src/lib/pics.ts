import { ObjectId } from "mongodb"
import { getAppSettings } from "@/lib/app-settings"
import { describeMongoError, getPicsCollection, mongoUri } from "@/lib/mongo"
import { publicBase, resolveSrc } from "@/lib/r2"
import { VIP_PIC_FREE } from "@/lib/vip"

export const PIC_FREE_LIMIT = VIP_PIC_FREE

export type PicItem = {
  id: string
  name: string
  src: string
  likes: number
  bookmarks: number
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

export async function getPicsByIds(ids: string[]) {
  const ordered = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
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

export async function getRandomPics(vip: boolean) {
  const settings = await getAppSettings()
  const freeLimit = settings.freeDailyPics
  const base = publicBase()
  if (!mongoUri()) {
    return { pics: [] as PicItem[], limited: !vip, freeLimit, error: "缺少 MONGODB_URI" }
  }
  try {
    const collection = await getPicsCollection()
    // VIP 多抽一些可换一批；非 VIP 当天由客户端缓存固定额度
    const docs = vip
      ? ((await collection.aggregate([{ $sample: { size: Math.max(40, freeLimit) } }]).toArray()) as RawPic[])
      : ((await collection.aggregate([{ $sample: { size: freeLimit } }]).toArray()) as RawPic[])
    const mapped = docs.flatMap((doc) => {
      const item = mapPic(doc, base)
      return item ? [item] : []
    })
    if (docs.length > 0 && mapped.length === 0) {
      return {
        pics: [] as PicItem[],
        limited: !vip,
        freeLimit,
        error: "pics 有数据，但图片地址拼不出来。需要 NEXT_PUBLIC_R2_PUBLIC_BASE，或把 pic 写成完整 https。",
      }
    }
    if (mapped.length === 0) {
      return {
        pics: [] as PicItem[],
        limited: !vip,
        freeLimit,
        error: "pics 集合还是空的",
      }
    }
    return {
      pics: shuffle(mapped),
      limited: !vip,
      freeLimit,
      totalHint: vip ? mapped.length : freeLimit,
    }
  } catch (error) {
    return {
      pics: [] as PicItem[],
      limited: !vip,
      freeLimit,
      error: describeMongoError(error),
    }
  }
}
