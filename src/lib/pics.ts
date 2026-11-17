import { getAppSettings } from "@/lib/app-settings"
import { describeMongoError, getPicsCollection, mongoUri } from "@/lib/mongo"
import { publicBase, resolveSrc } from "@/lib/r2"
import { VIP_PIC_FREE } from "@/lib/vip"

export const PIC_FREE_LIMIT = VIP_PIC_FREE

export type PicItem = {
  id: string
  name: string
  src: string
}

type RawPic = {
  _id?: { toString(): string }
  name?: unknown
  pic?: unknown
  src?: unknown
  url?: unknown
}

function shuffle<T>(items: T[]) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swap]] = [next[swap], next[index]]
  }
  return next
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
  const id = doc._id ? String(doc._id) : absolute
  return { id, name, src: absolute }
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
