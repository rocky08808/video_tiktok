import { demos } from "@/lib/demos"
import { describeMongoError, getVideoCollection, mongoUri } from "@/lib/mongo"
import { playbackSrc, publicBase, resolveSrc } from "@/lib/r2"
import type { VideoFeedResponse, VideoItem } from "@/lib/types"

type RawVideo = Partial<VideoItem> & { id?: string | number; src?: string }

export const VIDEO_PAGE_SIZE = 40
/** 单次 exclude 上限（整库去重一轮）；超出则截尾，一般够用 */
export const VIDEO_EXCLUDE_MAX = 50_000
/** 无 exclude 的首包可短缓存；带 exclude 的抽样不缓存 */
export const VIDEO_FEED_CACHE_TTL_MS = 45_000

const globalCache = globalThis as typeof globalThis & {
  skVideoFeedCache?: { at: number; value: VideoFeedResponse }
}

function shuffleInPlace<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[items[index], items[swap]] = [items[swap], items[index]]
  }
  return items
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
  // 新的覆盖旧的：超出上限只保留尾部
  return out.length > VIDEO_EXCLUDE_MAX ? out.slice(-VIDEO_EXCLUDE_MAX) : out
}

function mapVideos(inputs: RawVideo[], base: string) {
  const videos: VideoItem[] = []
  for (const item of inputs) {
    if (!item || typeof item.src !== "string") continue
    const absolute = resolveSrc(item.src, base)
    if (!absolute) continue
    const poster = item.poster ? resolveSrc(item.poster, base) : null
    const avatar = item.avatar ? resolveSrc(item.avatar, base) : null
    const author = item.author || "用户"
    videos.push({
      id: String(item.id ?? absolute),
      author,
      handle: item.handle || author,
      description: item.description || "",
      music: item.music || `原声 - ${author}`,
      likes: Number(item.likes) || 0,
      comments: Number(item.comments) || 0,
      shares: Number(item.shares) || 0,
      bookmarks: Number(item.bookmarks) || 0,
      src: playbackSrc(absolute, base),
      poster: poster || undefined,
      avatar: avatar || undefined,
      following: Boolean(item.following),
    })
  }
  return videos
}

function sampleFromList(videos: VideoItem[], limit: number, exclude: string[]) {
  const blocked = new Set(exclude)
  const pool = videos.filter((video) => !blocked.has(video.id))
  shuffleInPlace(pool)
  const page = pool.slice(0, limit)
  return {
    videos: page,
    mode: "demo" as const,
    hasMore: pool.length > page.length,
  }
}

export async function getVideosByIds(ids: string[]) {
  const ordered = normalizeExclude(ids)
  const envBase = publicBase()
  if (ordered.length === 0) {
    return { videos: [] as VideoItem[], mode: "r2" as const, base: envBase || undefined }
  }

  if (mongoUri()) {
    try {
      const collection = await getVideoCollection()
      const docs = (await collection.find({ id: { $in: ordered } }).toArray()) as RawVideo[]
      const mapped = mapVideos(docs, envBase)
      const byId = new Map(mapped.map((video) => [video.id, video]))
      const videos = ordered.flatMap((id) => {
        const hit = byId.get(id)
        return hit ? [hit] : []
      })
      return { videos, mode: "r2" as const, base: envBase || undefined }
    } catch (error) {
      return {
        videos: [] as VideoItem[],
        mode: "r2" as const,
        base: envBase || undefined,
        error: describeMongoError(error),
      }
    }
  }

  const byId = new Map(demos.map((video) => [video.id, video]))
  return {
    videos: ordered.flatMap((id) => {
      const hit = byId.get(id)
      return hit ? [hit] : []
    }),
    mode: "demo" as const,
  }
}

export async function getVideosPage(input?: {
  limit?: number
  exclude?: string[]
}): Promise<VideoFeedResponse & { hasMore?: boolean }> {
  const limit = Math.min(
    100,
    Math.max(1, Math.round(Number(input?.limit) || VIDEO_PAGE_SIZE)),
  )
  const exclude = normalizeExclude(input?.exclude)
  const envBase = publicBase()
  const manifestUrl = process.env.R2_MANIFEST_URL

  // 首包无 exclude 时用短缓存
  if (exclude.length === 0) {
    const hit = globalCache.skVideoFeedCache
    if (hit && Date.now() - hit.at < VIDEO_FEED_CACHE_TTL_MS && hit.value.videos.length > 0) {
      return { ...hit.value, hasMore: true }
    }
  }

  if (mongoUri()) {
    try {
      const collection = await getVideoCollection()
      const pipeline: Record<string, unknown>[] = []
      if (exclude.length > 0) {
        pipeline.push({ $match: { id: { $nin: exclude } } })
      }
      pipeline.push({ $sample: { size: limit } })
      const docs = (await collection.aggregate(pipeline).toArray()) as RawVideo[]
      const videos = mapVideos(docs, envBase)
      if (docs.length > 0 && videos.length === 0) {
        return {
          videos: [],
          mode: "r2",
          base: envBase || undefined,
          hasMore: false,
          error:
            "数据库里有记录，但地址播不了。相对路径需要 NEXT_PUBLIC_R2_PUBLIC_BASE，或者把 src 写成完整的 https 地址。",
        }
      }
      if (videos.length === 0) {
        return {
          videos: [],
          mode: "r2",
          base: envBase || undefined,
          hasMore: false,
          error: exclude.length > 0 ? undefined : "已经连上宝塔 MongoDB，videos 集合还是空的。",
        }
      }
      const result = {
        videos,
        mode: "r2" as const,
        base: envBase || undefined,
        hasMore: videos.length >= limit,
      }
      if (exclude.length === 0) {
        globalCache.skVideoFeedCache = { at: Date.now(), value: result }
      }
      return result
    } catch (error) {
      return {
        videos: [],
        mode: "r2",
        base: envBase || undefined,
        hasMore: false,
        error: describeMongoError(error),
      }
    }
  }

  if (manifestUrl) {
    try {
      const response = await fetch(manifestUrl, { next: { revalidate: 30 } })
      if (!response.ok) {
        return {
          videos: [],
          mode: "r2",
          base: envBase,
          hasMore: false,
          error: `清单请求失败（${response.status}）`,
        }
      }
      const json = (await response.json()) as { videos?: RawVideo[]; baseUrl?: string } | RawVideo[]
      const base = (Array.isArray(json) ? envBase : json.baseUrl || envBase).replace(/\/$/, "")
      const raw = Array.isArray(json) ? json : (json.videos ?? [])
      const all = mapVideos(raw, base)
      if (all.length === 0) {
        return { videos: [], mode: "r2", base, hasMore: false, error: "清单里没有可播放的 m3u8" }
      }
      const page = sampleFromList(all, limit, exclude)
      return { ...page, mode: "r2", base }
    } catch {
      return {
        videos: [],
        mode: "r2",
        base: envBase,
        hasMore: false,
        error: "无法拉取 R2 上的视频清单",
      }
    }
  }

  return sampleFromList(demos, limit, exclude)
}

/** @deprecated 使用 getVideosPage */
export async function getVideos(): Promise<VideoFeedResponse> {
  const page = await getVideosPage({ limit: VIDEO_PAGE_SIZE, exclude: [] })
  return page
}
