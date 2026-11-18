/** 从请求头取客户端 IP（Cloudflare / 反代优先） */
export function clientIp(request: Request) {
  const cf = request.headers.get("cf-connecting-ip")?.trim()
  if (cf) return cf.slice(0, 64)

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwarded) return forwarded.slice(0, 64)

  const real = request.headers.get("x-real-ip")?.trim()
  if (real) return real.slice(0, 64)

  return "unknown"
}
