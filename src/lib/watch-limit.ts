import { readClientSettings } from "@/lib/client-settings"

function dayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

function watchKey() {
  return `sk_watch_${dayKey()}`
}

function freePackKey() {
  return `sk_free_${dayKey()}`
}

function movieWatchKey() {
  return `sk_movie_watch_${dayKey()}`
}

function movieFreePackKey() {
  return `sk_movie_free_${dayKey()}`
}

function freeVideoDailyLimit() {
  const n = readClientSettings().freeDailyVideos
  return typeof n === "number" && n > 0 ? n : 1
}

function freeMovieDailyLimit() {
  const n = readClientSettings().freeDailyMovies
  return typeof n === "number" && n > 0 ? n : 3
}

/** 清掉非今日的免费包 / 观看记录，第二天自动换新 */
function purgeOldDayCaches() {
  try {
    const keepWatch = watchKey()
    const keepFree = freePackKey()
    const keepMovie = movieWatchKey()
    const keepMovieFree = movieFreePackKey()
    const remove: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key) continue
      if (key.startsWith("sk_watch_") && key !== keepWatch) remove.push(key)
      if (key.startsWith("sk_free_") && key !== keepFree) remove.push(key)
      if (key.startsWith("sk_movie_watch_") && key !== keepMovie) remove.push(key)
      if (key.startsWith("sk_movie_free_") && key !== keepMovieFree) remove.push(key)
    }
    for (const key of remove) localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function readIdList(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && id.length > 0) : []
  } catch {
    return []
  }
}

function writeIdList(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids))
  } catch {
    // ignore quota / private mode
  }
}

export function readWatchedIds() {
  purgeOldDayCaches()
  return readIdList(watchKey())
}

export function noteWatchedId(id: string) {
  purgeOldDayCaches()
  const limit = freeVideoDailyLimit()
  const current = readIdList(watchKey())
  if (current.includes(id)) return current
  const next = [...current, id].slice(0, limit)
  writeIdList(watchKey(), next)
  return next
}

export function readFreePackIds() {
  purgeOldDayCaches()
  return readIdList(freePackKey()).slice(0, freeVideoDailyLimit())
}

/** 非 VIP 当日固定额度：已有今日缓存则沿用，否则重新抽一批写入 */
export function ensureFreePackIds(candidateIds: string[]) {
  purgeOldDayCaches()
  const limit = freeVideoDailyLimit()
  const key = freePackKey()
  const cached = readIdList(key).slice(0, limit)
  const available = new Set(candidateIds)
  const kept = cached.filter((id) => available.has(id))
  if (kept.length >= limit) {
    const next = kept.slice(0, limit)
    if (next.join("\0") !== cached.join("\0")) writeIdList(key, next)
    return next
  }
  const have = new Set(kept)
  const fill = candidateIds.filter((id) => !have.has(id)).slice(0, limit - kept.length)
  const next = [...kept, ...fill].slice(0, limit)
  writeIdList(key, next)
  return next
}

export function pickFreePack<T extends { id: string }>(videos: T[]) {
  const ids = ensureFreePackIds(videos.map((video) => video.id))
  const byId = new Map(videos.map((video) => [video.id, video]))
  return ids.flatMap((id) => {
    const video = byId.get(id)
    return video ? [video] : []
  })
}

export function canWatchVideo(id: string, vip: boolean) {
  if (vip) return true
  const pack = readFreePackIds()
  if (pack.length > 0) return pack.includes(id)
  const watched = readWatchedIds()
  if (watched.includes(id)) return true
  return watched.length < freeVideoDailyLimit()
}

export function watchedCountToday() {
  return readWatchedIds().length
}

export function freePackFull() {
  return readFreePackIds().length >= freeVideoDailyLimit()
}

export function readFreeMoviePackIds() {
  purgeOldDayCaches()
  return readIdList(movieFreePackKey()).slice(0, freeMovieDailyLimit())
}

/** 非 VIP 当日固定电影包：已有今日缓存则沿用，否则从候选里补满 */
export function ensureFreeMoviePackIds(candidateIds: string[]) {
  purgeOldDayCaches()
  const limit = freeMovieDailyLimit()
  const key = movieFreePackKey()
  const cached = readIdList(key).slice(0, limit)
  if (candidateIds.length === 0) return cached
  // 已缓存的 id 即使暂时不在本页也保留
  const keptAll = cached.slice(0, limit)
  if (keptAll.length >= limit) return keptAll
  const have = new Set(keptAll)
  const fill = candidateIds.filter((id) => !have.has(id)).slice(0, limit - keptAll.length)
  const next = [...keptAll, ...fill].slice(0, limit)
  writeIdList(key, next)
  return next
}

export function readWatchedMovieIds() {
  purgeOldDayCaches()
  return readIdList(movieWatchKey())
}

export function noteWatchedMovieId(id: string) {
  purgeOldDayCaches()
  const limit = freeMovieDailyLimit()
  const current = readIdList(movieWatchKey())
  if (current.includes(id)) return current
  const next = [...current, id].slice(0, limit)
  writeIdList(movieWatchKey(), next)
  return next
}

export function canWatchMovie(id: string, vip: boolean) {
  if (vip) return true
  if (!id) return false
  const pack = readFreeMoviePackIds()
  if (pack.length > 0) return pack.includes(id)
  const watched = readWatchedMovieIds()
  if (watched.includes(id)) return true
  return watched.length < freeMovieDailyLimit()
}

export function watchedMovieCountToday() {
  return readWatchedMovieIds().length
}

export function freeMovieLimit() {
  return freeMovieDailyLimit()
}
