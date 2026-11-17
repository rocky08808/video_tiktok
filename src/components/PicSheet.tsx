"use client"

import { useEffect, useRef, useState } from "react"
import { VIP_PIC_FREE } from "@/lib/vip"

const PIC_FREE_LIMIT = VIP_PIC_FREE
const PICS_CACHE_KEY = "sk_pics"

type PicItem = {
  id: string
  name: string
  src: string
}

type PicsCache = {
  vip: boolean
  pics: PicItem[]
  index: number
}

function readCache(vip: boolean): PicsCache | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PICS_CACHE_KEY) || "null") as PicsCache | null
    if (!parsed || parsed.vip !== vip || !Array.isArray(parsed.pics) || parsed.pics.length === 0) {
      return null
    }
    const pics = parsed.pics.filter(
      (item): item is PicItem =>
        !!item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.src === "string",
    )
    if (pics.length === 0) return null
    const index = Math.min(pics.length - 1, Math.max(0, Number(parsed.index) || 0))
    return { vip, pics, index }
  } catch {
    return null
  }
}

function writeCache(vip: boolean, pics: PicItem[], index: number) {
  try {
    const safeIndex = Math.min(pics.length - 1, Math.max(0, index))
    sessionStorage.setItem(
      PICS_CACHE_KEY,
      JSON.stringify({ vip, pics, index: Number.isFinite(safeIndex) ? safeIndex : 0 } satisfies PicsCache),
    )
  } catch {
    // ignore
  }
}

export function PicSheet({
  open,
  vip,
  onClose,
  onOpenVip,
}: {
  open: boolean
  vip: boolean
  onClose: () => void
  onOpenVip: () => void
}) {
  const [pics, setPics] = useState<PicItem[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limited, setLimited] = useState(!vip)
  const [touchY, setTouchY] = useState<number | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef(0)
  const requestId = useRef(0)
  const restorePending = useRef(false)

  indexRef.current = index

  function applyPics(next: PicItem[], nextIndex: number, nextLimited: boolean) {
    const safeIndex = Math.min(next.length - 1, Math.max(0, nextIndex))
    setLimited(nextLimited)
    setPics(next)
    setIndex(safeIndex)
    indexRef.current = safeIndex
    writeCache(vip, next, safeIndex)
    restorePending.current = true
  }

  async function loadPics(force: boolean) {
    if (!force) {
      const cached = readCache(vip)
      if (cached) {
        setError(null)
        applyPics(cached.pics, cached.index, !vip)
        setLoading(false)
        return
      }
    }
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/pics")
      const data = (await response.json()) as {
        pics?: PicItem[]
        limited?: boolean
        error?: string
      }
      if (id !== requestId.current) return
      const next = Array.isArray(data.pics) ? data.pics : []
      const nextLimited = data.limited !== false && !vip
      if (data.error && next.length === 0) {
        setError(data.error)
        setPics([])
        return
      }
      if (next.length === 0) {
        setError("暂时没有美图")
        setPics([])
        return
      }
      applyPics(next, force ? 0 : indexRef.current, nextLimited)
    } catch {
      if (id !== requestId.current) return
      setError("网络不好，稍后再试")
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void loadPics(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload when sheet opens or vip flips
  }, [open, vip])

  useEffect(() => {
    if (!open || pics.length === 0) return
    const root = scrollerRef.current
    if (!root || root.clientHeight === 0) return
    if (!restorePending.current) return
    restorePending.current = false
    root.scrollTop = indexRef.current * root.clientHeight
  }, [open, pics])

  function onScroll() {
    const root = scrollerRef.current
    if (!root || root.clientHeight === 0 || pics.length === 0) return
    const next = Math.min(pics.length - 1, Math.max(0, Math.round(root.scrollTop / root.clientHeight)))
    if (next === indexRef.current) return
    indexRef.current = next
    setIndex(next)
    writeCache(vip, pics, next)
  }

  return (
    <div inert={!open} className={`absolute inset-0 z-50 ${open ? "" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-black/80 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <section
        className={`absolute inset-0 flex flex-col bg-[#0c0a10] transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!open}
      >
        <header className="relative z-10 flex shrink-0 items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]">
          <button
            type="button"
            className="grid h-10 w-10 place-items-center text-xl text-white/80"
            onClick={onClose}
            aria-label="关闭美图"
          >
            ×
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold tracking-wide">美图</p>
            <p className="text-[11px] text-white/40">
              {pics.length > 0
                ? `${index + 1} / ${pics.length}`
                : limited
                  ? `免费前 ${PIC_FREE_LIMIT} 张`
                  : "精选美图"}
            </p>
          </div>
          {vip ? (
            <button
              type="button"
              className="h-10 rounded-full px-2 text-[13px] text-white/70 disabled:opacity-40"
              disabled={loading}
              onClick={() => void loadPics(true)}
            >
              换一批
            </button>
          ) : (
            <span className="w-10" />
          )}
        </header>

        <div
          ref={scrollerRef}
          className="relative min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain"
          onScroll={onScroll}
          onTouchStart={(event) => setTouchY(event.touches[0]?.clientY ?? null)}
          onTouchEnd={(event) => {
            if (touchY == null) return
            const endY = event.changedTouches[0]?.clientY
            setTouchY(null)
            if (endY == null) return
            const delta = touchY - endY
            if (Math.abs(delta) < 48) return
            const root = scrollerRef.current
            if (!root || root.clientHeight === 0) return
            const next = Math.min(pics.length - 1, Math.max(0, index + (delta > 0 ? 1 : -1)))
            root.scrollTo({ top: next * root.clientHeight, behavior: "smooth" })
          }}
        >
          {loading && pics.length === 0 ? (
            <div className="grid h-full place-items-center">
              <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            </div>
          ) : error && pics.length === 0 ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <div>
                <p className="text-lg font-medium">美图加载失败</p>
                <p className="mt-2 text-sm leading-6 text-white/55">{error}</p>
              </div>
            </div>
          ) : (
            pics.map((pic) => (
              <article
                key={pic.id}
                className="relative flex h-full w-full snap-start snap-always items-center justify-center px-3 py-4"
              >
                <img
                  src={pic.src}
                  alt={pic.name}
                  className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
                  draggable={false}
                />
              </article>
            ))
          )}
        </div>

        {limited && (
          <div className="relative z-10 shrink-0 border-t border-white/10 bg-[#141018]/95 px-5 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] backdrop-blur">
            <p className="text-center text-[12px] text-white/45">
              普通用户可看前 {PIC_FREE_LIMIT} 张 · VIP 畅看全部美图
            </p>
            <button
              type="button"
              className="mt-2.5 h-11 w-full rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-sm font-semibold"
              onClick={onOpenVip}
            >
              开通 VIP 看更多
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
