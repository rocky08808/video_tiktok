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

/**
 * 是否走 Next HLS 代理。
 * - 开发环境：HLS_PROXY=1 时开启（解决 localhost Referer 被 R2 拦截）
 * - 生产环境：默认直连 R2 CDN；仅 HLS_PROXY=force 时才代理（会变慢，勿常规开启）
 */
export function hlsProxyEnabled() {
  const flag = process.env.HLS_PROXY?.trim().toLowerCase()
  if (flag === "force") return true
  if (flag === "1" || flag === "true" || flag === "yes") {
    return process.env.NODE_ENV !== "production"
  }
  return false
}

export function playbackSrc(absoluteUrl: string, base: string) {
  if (hlsProxyEnabled() && isUnderBase(absoluteUrl, base)) {
    return `/api/hls?src=${encodeURIComponent(absoluteUrl)}`
  }
  return absoluteUrl
}
