import { messages, type Locale, type Messages } from "@/lib/i18n/messages"

export type { Locale, Messages }
export { messages }

export const LOCALE_STORAGE_KEY = "sk_locale"

export function isChineseLanguage(tag: string | null | undefined) {
  return Boolean(tag && /^zh\b/i.test(tag))
}

export function isLocale(value: unknown): value is Locale {
  return value === "zh" || value === "en"
}

export function readStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(raw) ? raw : null
  } catch {
    return null
  }
}

export function writeStoredLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // ignore
  }
}

/** 浏览器 / 系统语言：中文用 zh，其它用 en */
export function detectLocale(langs?: readonly string[] | null): Locale {
  const list =
    langs && langs.length > 0
      ? langs
      : typeof navigator !== "undefined"
        ? navigator.languages?.length
          ? navigator.languages
          : navigator.language
            ? [navigator.language]
            : []
        : []
  for (const tag of list) {
    if (isChineseLanguage(tag)) return "zh"
  }
  return "en"
}

/** 优先用户选择，否则跟系统语言 */
export function resolveLocale(langs?: readonly string[] | null): Locale {
  return readStoredLocale() ?? detectLocale(langs)
}

export function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
  document.documentElement.dataset.locale = locale
}

type Vars = Record<string, string | number>

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const raw = getPath(messages[locale], key) ?? getPath(messages.zh, key) ?? key
  if (typeof raw !== "string") return key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name]
    return value == null ? `{${name}}` : String(value)
  })
}

export type TranslateFn = (key: string, vars?: Vars) => string
