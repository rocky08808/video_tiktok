import { readClientSettings } from "@/lib/client-settings"

export type PackedPic = {
  id: string
  name: string
  src: string
  likes?: number
  bookmarks?: number
}

type PackCache = {
  pics: PackedPic[]
  index: number
}

function dayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

function freePicKey() {
  return `sk_pic_free_${dayKey()}`
}

function freePicLimit() {
  return readClientSettings().freeDailyPics
}

function purgeOldPicPacks() {
  try {
    const keep = freePicKey()
    const remove: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key) continue
      if (key.startsWith("sk_pic_free_") && key !== keep) remove.push(key)
    }
    for (const key of remove) localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function isPic(item: unknown): item is PackedPic {
  if (!item || typeof item !== "object") return false
  const row = item as PackedPic
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.name === "string" &&
    typeof row.src === "string" &&
    row.src.length > 0
  )
}

export function readFreePicPack(): PackCache | null {
  purgeOldPicPacks()
  try {
    const limit = freePicLimit()
    const parsed = JSON.parse(localStorage.getItem(freePicKey()) || "null") as PackCache | null
    if (!parsed || !Array.isArray(parsed.pics)) return null
    const pics = parsed.pics.filter(isPic).slice(0, limit)
    if (pics.length === 0) return null
    const index = Math.min(pics.length - 1, Math.max(0, Number(parsed.index) || 0))
    return { pics, index }
  } catch {
    return null
  }
}

export function writeFreePicPack(pics: PackedPic[], index: number) {
  purgeOldPicPacks()
  const limit = freePicLimit()
  const next = pics.filter(isPic).slice(0, limit)
  if (next.length === 0) return
  const safeIndex = Math.min(next.length - 1, Math.max(0, index))
  try {
    localStorage.setItem(
      freePicKey(),
      JSON.stringify({ pics: next, index: Number.isFinite(safeIndex) ? safeIndex : 0 } satisfies PackCache),
    )
  } catch {
    // ignore
  }
}

export { freePicLimit }
