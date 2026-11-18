/** 站点公开地址，末尾不要斜杠。用于 SEO 的 canonical / sitemap / OG */
export function siteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    ""
  return raw.replace(/\/$/, "")
}

export const SITE_NAME = "瞬看"
export const SITE_TAGLINE = "竖屏短视频与美图，随时刷，精彩不停"
export const SITE_DESCRIPTION =
  "瞬看是竖屏短视频应用，支持推荐流、收藏、美图浏览与 VIP 无限观看。每天都有新鲜内容，打开即看。"
