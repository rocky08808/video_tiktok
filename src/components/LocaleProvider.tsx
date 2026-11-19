"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  applyDocumentLocale,
  isLocale,
  resolveLocale,
  translate,
  writeStoredLocale,
  type Locale,
  type TranslateFn,
} from "@/lib/i18n"

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: TranslateFn
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "zh",
  setLocale: () => {},
  t: (key, vars) => translate("zh", key, vars),
})

function readBootLocale(): Locale {
  if (typeof document !== "undefined") {
    const boot = document.documentElement.dataset.locale
    if (isLocale(boot)) return boot
  }
  return resolveLocale()
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh")

  useEffect(() => {
    const next = readBootLocale()
    setLocaleState(next)
    applyDocumentLocale(next)
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    writeStoredLocale(next)
    applyDocumentLocale(next)
  }, [])

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}

export function useT() {
  return useContext(LocaleContext).t
}
