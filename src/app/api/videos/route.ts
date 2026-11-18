import { connection } from "next/server"
import {
  getVideosPage,
  VIDEO_EXCLUDE_MAX,
  VIDEO_FEED_CACHE_TTL_MS,
  VIDEO_PAGE_SIZE,
} from "@/lib/videos"

function parseLimit(raw: unknown) {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return VIDEO_PAGE_SIZE
  return Math.min(100, Math.max(1, n))
}

function parseExclude(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[]
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0).slice(-VIDEO_EXCLUDE_MAX)
}

export async function GET(request: Request) {
  await connection()
  const url = new URL(request.url)
  const excludeParam = url.searchParams.get("exclude")
  const exclude = excludeParam
    ? excludeParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(-VIDEO_EXCLUDE_MAX)
    : []
  const limit = parseLimit(url.searchParams.get("limit"))
  const feed = await getVideosPage({ limit, exclude })
  const maxAge = Math.max(1, Math.round(VIDEO_FEED_CACHE_TTL_MS / 1000))
  return Response.json(feed, {
    headers: {
      // 仅首包（无 exclude）走短缓存；带 exclude 的抽样不缓存
      "Cache-Control":
        exclude.length === 0
          ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`
          : "no-store",
    },
  })
}

export async function POST(request: Request) {
  await connection()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ videos: [], mode: "r2", hasMore: false, error: "请求格式不对" }, { status: 400 })
  }
  const payload = (body ?? {}) as { limit?: unknown; exclude?: unknown }
  const feed = await getVideosPage({
    limit: parseLimit(payload.limit),
    exclude: parseExclude(payload.exclude),
  })
  return Response.json(feed, { headers: { "Cache-Control": "no-store" } })
}
