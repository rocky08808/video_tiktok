import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/site"

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl()
  if (!origin) return []
  const now = new Date()
  return [
    {
      url: origin,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${origin}/vip`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ]
}
