import { VIP_FREE_DAILY } from "@/lib/vip"

function dayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

function storageKey() {
  return `sk_watch_${dayKey()}`
}

export function readWatchedIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) || "[]") as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

export function noteWatchedId(id: string) {
  const current = readWatchedIds()
  if (current.includes(id)) return current
  const next = [...current, id]
  localStorage.setItem(storageKey(), JSON.stringify(next.slice(0, 500)))
  return next
}

export function canWatchVideo(id: string, vip: boolean) {
  if (vip) return true
  const watched = readWatchedIds()
  if (watched.includes(id)) return true
  return watched.length < VIP_FREE_DAILY
}

export function watchedCountToday() {
  return readWatchedIds().length
}
