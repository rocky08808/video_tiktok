import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/site"

export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl()
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/vip"],
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
    ],
    ...(origin
      ? {
          sitemap: `${origin}/sitemap.xml`,
          host: origin,
        }
      : {}),
  }
}
