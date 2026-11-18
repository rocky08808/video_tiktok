import type { Metadata } from "next"
import { Feed } from "@/components/Feed"
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site"

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} · ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
}

export default function Home() {
  return (
    <>
      <header className="sr-only">
        <h1>{SITE_NAME}</h1>
        <p>{SITE_TAGLINE}</p>
        <p>{SITE_DESCRIPTION}</p>
        <nav>
          <ul>
            <li>推荐短视频</li>
            <li>美图浏览</li>
            <li>收藏与 VIP</li>
          </ul>
        </nav>
      </header>
      <Feed />
    </>
  )
}
