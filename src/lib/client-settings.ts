import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/settings-types"

let current: AppSettings = { ...DEFAULT_APP_SETTINGS }

export function readClientSettings() {
  return current
}

export function applyClientSettings(next: Partial<AppSettings> | null | undefined) {
  if (!next) return current
  current = {
    freeDailyVideos:
      typeof next.freeDailyVideos === "number" && next.freeDailyVideos > 0
        ? Math.round(next.freeDailyVideos)
        : current.freeDailyVideos,
    freeDailyPics:
      typeof next.freeDailyPics === "number" && next.freeDailyPics > 0
        ? Math.round(next.freeDailyPics)
        : current.freeDailyPics,
    freeDailyMovies:
      typeof next.freeDailyMovies === "number" && next.freeDailyMovies > 0
        ? Math.round(next.freeDailyMovies)
        : current.freeDailyMovies,
    inviteNeed:
      typeof next.inviteNeed === "number" && next.inviteNeed > 0 ? Math.round(next.inviteNeed) : current.inviteNeed,
    vipPriceUsdt:
      typeof next.vipPriceUsdt === "number" && next.vipPriceUsdt > 0
        ? Math.round(next.vipPriceUsdt * 1000) / 1000
        : current.vipPriceUsdt,
  }
  return current
}

export async function fetchClientSettings() {
  try {
    const response = await fetch("/api/settings", { cache: "no-store" })
    const data = (await response.json()) as Partial<AppSettings>
    if (!response.ok) return current
    return applyClientSettings(data)
  } catch {
    return current
  }
}
