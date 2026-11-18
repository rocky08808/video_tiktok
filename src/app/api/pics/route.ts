import { connection } from "next/server"
import { currentUser } from "@/lib/auth"
import { getPicsPage, PIC_EXCLUDE_MAX, PIC_PAGE_SIZE } from "@/lib/pics"

function parseLimit(raw: unknown) {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.min(100, n)
}

function parseExclude(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[]
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0).slice(-PIC_EXCLUDE_MAX)
}

export async function GET(request: Request) {
  await connection()
  const user = await currentUser().catch(() => null)
  const vip = user?.vip === true
  const url = new URL(request.url)
  const excludeParam = url.searchParams.get("exclude")
  const exclude = excludeParam
    ? excludeParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(-PIC_EXCLUDE_MAX)
    : []
  const feed = await getPicsPage({
    vip,
    limit: parseLimit(url.searchParams.get("limit")) ?? (vip ? PIC_PAGE_SIZE : undefined),
    exclude,
  })
  return Response.json(feed, {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: Request) {
  await connection()
  const user = await currentUser().catch(() => null)
  const vip = user?.vip === true
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { pics: [], limited: !vip, hasMore: false, error: "请求格式不对" },
      { status: 400 },
    )
  }
  const payload = (body ?? {}) as { limit?: unknown; exclude?: unknown }
  const feed = await getPicsPage({
    vip,
    limit: parseLimit(payload.limit) ?? (vip ? PIC_PAGE_SIZE : undefined),
    exclude: parseExclude(payload.exclude),
  })
  return Response.json(feed, { headers: { "Cache-Control": "no-store" } })
}
