import { demos } from "@/lib/demos"
import { describeMongoError, getVideoCollection, mongoUri } from "@/lib/mongo"
import { playbackSrc, publicBase, resolveSrc } from "@/lib/r2"
import type { VideoFeedResponse, VideoItem } from "@/lib/types"

type RawVideo = Partial<VideoItem> & { id?: string | number; src?: string }

export async function getVideos(): Promise<VideoFeedResponse> {
  const envBase = publicBase()
  const manifestUrl = process.env.R2_MANIFEST_URL

  if (mongoUri()) {
    try {
      const collection = await getVideoCollection()
      const docs = await collection.find({}).sort({ order: 1, createdAt: -1 }).limit(5000).toArray()
      const videos = mapVideos(docs as RawVideo[], envBase)
      if (docs.length > 0 && videos.length === 0) {
        return {
          videos: [],
          mode: "r2",
          base: envBase || undefined,
          error: "数据库里有记录，但地址播不了。相对路径需要 NEXT_PUBLIC_R2_PUBLIC_BASE，或者把 src 写成完整的 https 地址。",
        }
      }
      if (videos.length === 0) {
        return {
          videos: [],
          mode: "r2",
          base: envBase || undefined,
          error: "已经连上宝塔 MongoDB，videos 集合还是空的。",
        }
      }
      return { videos, mode: "r2", base: envBase || undefined }
    } catch (error) {
      return { videos: [], mode: "r2", base: envBase || undefined, error: describeMongoError(error) }
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
          error: `清单请求失败（${response.status}）`,
        }
      }
      const json = (await response.json()) as { videos?: RawVideo[]; baseUrl?: string } | RawVideo[]
      const base = (Array.isArray(json) ? envBase : json.baseUrl || envBase).replace(/\/$/, "")
      const raw = Array.isArray(json) ? json : (json.videos ?? [])
      const videos = mapVideos(raw, base)
      if (videos.length === 0) {
        return { videos: [], mode: "r2", base, error: "清单里没有可播放的 m3u8" }
      }
      return { videos, mode: "r2", base }
    } catch {
      return { videos: [], mode: "r2", base: envBase, error: "无法拉取 R2 上的视频清单" }
    }
  }

  return { videos: demos, mode: "demo" }
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
