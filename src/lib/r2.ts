export function publicBase() {
  return (process.env.R2_PUBLIC_BASE || process.env.NEXT_PUBLIC_R2_PUBLIC_BASE || "").replace(
    /\/$/,
    "",
  )
}

export function isUnderBase(url: string, base: string) {
  if (!base) return false
  try {
    const target = new URL(url)
    const root = new URL(base.endsWith("/") ? base : `${base}/`)
    if (target.origin !== root.origin) return false
    const prefix = root.pathname.endsWith("/") ? root.pathname : `${root.pathname}/`
    return target.pathname.startsWith(prefix) || `${target.pathname}/` === prefix
  } catch {
    return false
  }
}

export function resolveSrc(src: string, base: string) {
  if (!src) return null
  if (/^https?:\/\//i.test(src)) return src
  if (!base) return null
  return `${base.replace(/\/$/, "")}/${src.replace(/^\//, "")}`
}

export function playbackSrc(absoluteUrl: string, base: string) {
  if (process.env.HLS_PROXY === "1" && isUnderBase(absoluteUrl, base)) {
    return `/api/hls?src=${encodeURIComponent(absoluteUrl)}`
  }
  return absoluteUrl
}
