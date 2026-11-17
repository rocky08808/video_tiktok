import { isPlaylist, rewritePlaylist } from "@/lib/playlist"
import { isUnderBase, publicBase } from "@/lib/r2"

export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get("src")
  const base = publicBase()
  if (!src || !isUnderBase(src, base)) {
    return Response.json({ error: "不允许的地址" }, { status: 403 })
  }

  const headers = new Headers()
  const range = request.headers.get("range")
  if (range) headers.set("Range", range)

  const upstream = await fetch(src, {
    headers,
    cache: "no-store",
    referrer: "",
    referrerPolicy: "no-referrer",
  })
  if (!upstream.ok && upstream.status !== 206) {
    return new Response("上游读取失败", { status: upstream.status || 502 })
  }

  const contentType = upstream.headers.get("content-type") ?? ""
  if (isPlaylist(src, contentType)) {
    const text = await upstream.text()
    return new Response(rewritePlaylist(text, src), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
        "Cache-Control": "public, max-age=15",
      },
    })
  }

  const out = new Headers()
  for (const key of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(key)
    if (value) out.set(key, value)
  }
  if (!out.has("content-type")) out.set("content-type", "video/mp2t")
  out.set("Cache-Control", "public, max-age=86400")
  return new Response(upstream.body, { status: upstream.status, headers: out })
}
