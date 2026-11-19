import { connection } from "next/server"
import { getMoviesByIds, getMoviesPage, MOVIE_PAGE_SIZE } from "@/lib/movies"

function parseLimit(raw: unknown) {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return MOVIE_PAGE_SIZE
  return Math.min(100, Math.max(1, n))
}

function parseOffset(raw: unknown) {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

export async function GET(request: Request) {
  await connection()
  const url = new URL(request.url)
  const feed = await getMoviesPage({
    limit: parseLimit(url.searchParams.get("limit")),
    offset: parseOffset(url.searchParams.get("offset")),
  })
  return Response.json(feed, {
    headers: {
      "Cache-Control":
        parseOffset(url.searchParams.get("offset")) === 0
          ? "public, s-maxage=30, stale-while-revalidate=60"
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
    return Response.json({ movies: [], hasMore: false, error: "请求格式不对" }, { status: 400 })
  }
  const payload = (body ?? {}) as { limit?: unknown; offset?: unknown; ids?: unknown }
  if (Array.isArray(payload.ids)) {
    const ids = payload.ids.filter((id): id is string => typeof id === "string")
    const feed = await getMoviesByIds(ids)
    return Response.json(feed, { headers: { "Cache-Control": "no-store" } })
  }
  const feed = await getMoviesPage({
    limit: parseLimit(payload.limit),
    offset: parseOffset(payload.offset),
  })
  return Response.json(feed, { headers: { "Cache-Control": "no-store" } })
}
