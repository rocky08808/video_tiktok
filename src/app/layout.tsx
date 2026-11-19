import type { Metadata, Viewport } from "next"
import Script from "next/script"
import { LocaleProvider } from "@/components/LocaleProvider"
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, siteUrl } from "@/lib/site"
import "./globals.css"

const localeBoot = `(function(){try{var stored=null;try{stored=localStorage.getItem("sk_locale")}catch(e){}var locale=stored==="zh"||stored==="en"?stored:null;if(!locale){var list=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language];var zh=false;for(var i=0;i<list.length;i++){if(/^zh\\b/i.test(list[i]||"")){zh=true;break}}locale=zh?"zh":"en"}document.documentElement.lang=locale==="zh"?"zh-CN":"en";document.documentElement.dataset.locale=locale}catch(e){}})();`

const origin = siteUrl()

export const metadata: Metadata = {
  metadataBase: origin ? new URL(origin) : undefined,
  title: {
    default: `${SITE_NAME} · ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["瞬看", "短视频", "竖屏视频", "美图", "VIP", "推荐视频", "在线刷视频"],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  referrer: "origin-when-cross-origin",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: origin
    ? {
        canonical: "/",
      }
    : undefined,
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: SITE_NAME,
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: origin || undefined,
    images: [{ url: "/logo.svg", width: 128, height: 128, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ["/logo.svg"],
  },
  category: "entertainment",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0a10" },
    { media: "(prefers-color-scheme: light)", color: "#0c0a10" },
  ],
  viewportFit: "cover",
  colorScheme: "dark",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: SITE_NAME,
        alternateName: ["瞬看短视频", "瞬看 App"],
        description: SITE_DESCRIPTION,
        inLanguage: "zh-CN",
        ...(origin ? { url: origin } : {}),
      },
      {
        "@type": "WebApplication",
        name: SITE_NAME,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        description: SITE_DESCRIPTION,
        inLanguage: "zh-CN",
        ...(origin ? { url: origin } : {}),
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "CNY",
          description: "基础免费观看，VIP 可无限观看与收藏",
        },
      },
    ],
  }

  return (
    <html lang="zh-CN" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: localeBoot }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="h-dvh overflow-hidden antialiased">
        <LocaleProvider>{children}</LocaleProvider>
        <Script
          src="https://cloud.webscount.com/script.js"
          strategy="afterInteractive"
          data-website-id="72a5fef4-024a-493d-a685-36f7a187329d"
        />
      </body>
    </html>
  )
}
