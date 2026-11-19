"use client"

import { useT } from "@/components/LocaleProvider"
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site"

/** 给爬虫 / 读屏的隐藏站点导览，跟随当前语言 */
export function HomeSeo() {
  const t = useT()
  return (
    <header className="sr-only">
      <h1>{SITE_NAME}</h1>
      <p>{SITE_TAGLINE}</p>
      <p>{SITE_DESCRIPTION}</p>
      <nav>
        <ul>
          <li>{t("home.navVideos")}</li>
          <li>{t("home.navPics")}</li>
          <li>{t("home.navVip")}</li>
        </ul>
      </nav>
    </header>
  )
}
