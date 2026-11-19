import type { Metadata } from "next"
import { Feed } from "@/components/Feed"
import { HomeSeo } from "@/components/HomeSeo"
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
      <HomeSeo />
      <Feed />
    </>
  )
}
