import { getSettingsCollection, mongoUri } from "@/lib/mongo"
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/settings-types"

export type { AppSettings }
export { DEFAULT_APP_SETTINGS }

const SETTINGS_KEY = "app"

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function clampPrice(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(10000, Math.max(0.001, Math.round(n * 1000) / 1000))
}

export function normalizeAppSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    freeDailyVideos: clampInt(input?.freeDailyVideos, 1, 500, DEFAULT_APP_SETTINGS.freeDailyVideos),
    freeDailyPics: clampInt(input?.freeDailyPics, 1, 500, DEFAULT_APP_SETTINGS.freeDailyPics),
    freeDailyMovies: clampInt(input?.freeDailyMovies, 1, 500, DEFAULT_APP_SETTINGS.freeDailyMovies),
    inviteNeed: clampInt(input?.inviteNeed, 1, 100, DEFAULT_APP_SETTINGS.inviteNeed),
    vipPriceUsdt: clampPrice(input?.vipPriceUsdt, DEFAULT_APP_SETTINGS.vipPriceUsdt),
  }
}

export async function getAppSettings(): Promise<AppSettings> {
  if (!mongoUri()) return { ...DEFAULT_APP_SETTINGS }
  try {
    const collection = await getSettingsCollection()
    const doc = await collection.findOne({ key: SETTINGS_KEY })
    return normalizeAppSettings({
      freeDailyVideos: doc?.freeDailyVideos as number | undefined,
      freeDailyPics: doc?.freeDailyPics as number | undefined,
      freeDailyMovies: doc?.freeDailyMovies as number | undefined,
      inviteNeed: doc?.inviteNeed as number | undefined,
      vipPriceUsdt: doc?.vipPriceUsdt as number | undefined,
    })
  } catch {
    return { ...DEFAULT_APP_SETTINGS }
  }
}

export async function updateAppSettings(input: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings()
  const next = normalizeAppSettings({ ...current, ...input })
  const collection = await getSettingsCollection()
  await collection.updateOne(
    { key: SETTINGS_KEY },
    {
      $set: {
        key: SETTINGS_KEY,
        freeDailyVideos: next.freeDailyVideos,
        freeDailyPics: next.freeDailyPics,
        freeDailyMovies: next.freeDailyMovies,
        inviteNeed: next.inviteNeed,
        vipPriceUsdt: next.vipPriceUsdt,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  )
  return next
}
