"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { IconBookmark, IconHeart } from "@/components/icons"
import { fetchClientSettings, readClientSettings } from "@/lib/client-settings"
import { formatCount } from "@/lib/format"
import { freePicLimit, readFreePicPack, writeFreePicPack, type PackedPic } from "@/lib/pic-pack"

const VIP_SESSION_KEY = "sk_pics_vip"
const LIKED_PIC_KEY = "sk_pic_liked"
const SAVED_PIC_KEY = "sk_pic_saved"

type PicItem = PackedPic & { likes: number; bookmarks: number }

type VipSessionCache = {
  pics: PicItem[]
  index: number
}

function normalizePic(item: PackedPic): PicItem {
  return {
    ...item,
    likes: Math.max(0, Math.round(Number(item.likes) || 0)),
    bookmarks: Math.max(0, Math.round(Number(item.bookmarks) || 0)),
  }
}

function readLocalIds(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

function writeLocalIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids))
  } catch {
    // ignore
  }
}

function readVipSession(): VipSessionCache | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(VIP_SESSION_KEY) || "null") as VipSessionCache | null
    if (!parsed || !Array.isArray(parsed.pics) || parsed.pics.length === 0) return null
    const pics = parsed.pics
      .filter(
        (item) =>
          !!item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.src === "string",
      )
      .map(normalizePic)
    if (pics.length === 0) return null
    const index = Math.min(pics.length - 1, Math.max(0, Number(parsed.index) || 0))
    return { pics, index }
  } catch {
    return null
  }
}

function writeVipSession(pics: PicItem[], index: number) {
  try {
    const safeIndex = Math.min(pics.length - 1, Math.max(0, index))
    sessionStorage.setItem(
      VIP_SESSION_KEY,
      JSON.stringify({ pics, index: Number.isFinite(safeIndex) ? safeIndex : 0 } satisfies VipSessionCache),
    )
  } catch {
    // ignore
  }
}

async function pushPicIds(kind: "liked" | "saved", ids: string[]) {
  const response = await fetch(kind === "liked" ? "/api/auth/pic-likes" : "/api/auth/pic-saved", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kind === "liked" ? { likedPicIds: ids } : { savedPicIds: ids }),
  })
  const data = (await response.json()) as {
    likedPicIds?: string[]
    savedPicIds?: string[]
    counts?: Record<string, number>
    error?: string
  }
  if (!response.ok) throw new Error(data.error || "同步失败")
  return data
}

export function PicSheet({
  open,
  vip,
  loggedIn,
  onClose,
  onOpenVip,
  onOpenLogin,
}: {
  open: boolean
  vip: boolean
  loggedIn: boolean
  onClose: () => void
  onOpenVip: () => void
  onOpenLogin: () => void
}) {
  const [pics, setPics] = useState<PicItem[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limited, setLimited] = useState(!vip)
  const [likedIds, setLikedIds] = useState<string[]>([])
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [headerHidden, setHeaderHidden] = useState(false)
  const [touchY, setTouchY] = useState<number | null>(null)
  const [savedListOpen, setSavedListOpen] = useState(false)
  const [savedList, setSavedList] = useState<PicItem[]>([])
  const [savedListLoading, setSavedListLoading] = useState(false)
  const [savedListError, setSavedListError] = useState<string | null>(null)
  const [browsingSaved, setBrowsingSaved] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef(0)
  const headerHiddenRef = useRef(false)
  const requestId = useRef(0)
  const restorePending = useRef(false)
  const likedSeq = useRef(0)
  const savedSeq = useRef(0)
  const suppressTap = useRef(false)
  const feedBackup = useRef<{ pics: PicItem[]; index: number } | null>(null)

  indexRef.current = index
  const current = pics[index] ?? null
  const liked = current ? likedIds.includes(current.id) : false
  const saved = current ? savedIds.includes(current.id) : false

  function applyHeaderHidden(hidden: boolean) {
    if (headerHiddenRef.current === hidden) return
    headerHiddenRef.current = hidden
    setHeaderHidden(hidden)
  }

  function persist(next: PicItem[], nextIndex: number) {
    if (browsingSaved) return
    if (vip) writeVipSession(next, nextIndex)
    else writeFreePicPack(next, nextIndex)
  }

  function applyPics(next: PackedPic[], nextIndex: number, nextLimited: boolean) {
    const normalized = next.map(normalizePic)
    const safeIndex = Math.min(normalized.length - 1, Math.max(0, nextIndex))
    setLimited(nextLimited)
    setPics(normalized)
    setIndex(safeIndex)
    indexRef.current = safeIndex
    persist(normalized, safeIndex)
    restorePending.current = true
  }

  function exitSavedBrowse() {
    const backup = feedBackup.current
    feedBackup.current = null
    setBrowsingSaved(false)
    applyHeaderHidden(false)
    if (!backup) return
    setPics(backup.pics)
    setIndex(backup.index)
    indexRef.current = backup.index
    restorePending.current = true
  }

  async function loadSavedList() {
    setSavedListLoading(true)
    setSavedListError(null)
    try {
      const response = await fetch("/api/pics/saved")
      const data = (await response.json()) as { pics?: PackedPic[]; error?: string }
      if (!response.ok) {
        setSavedList([])
        setSavedListError(data.error || "加载失败")
        return
      }
      const next = (Array.isArray(data.pics) ? data.pics : []).map(normalizePic)
      setSavedList(next)
      if (data.error && next.length === 0) setSavedListError(data.error)
    } catch {
      setSavedList([])
      setSavedListError("网络不好，稍后再试")
    } finally {
      setSavedListLoading(false)
    }
  }

  function openSavedList() {
    if (!loggedIn) {
      onOpenLogin()
      return
    }
    if (!vip) {
      onOpenVip()
      return
    }
    applyHeaderHidden(false)
    setSavedListOpen(true)
    void loadSavedList()
  }

  function openSavedPic(pic: PicItem) {
    if (!browsingSaved) {
      feedBackup.current = { pics, index: indexRef.current }
      setBrowsingSaved(true)
    }
    const list = savedList.length > 0 ? savedList : [pic]
    const nextIndex = Math.max(
      0,
      list.findIndex((item) => item.id === pic.id),
    )
    setSavedListOpen(false)
    setLimited(false)
    setPics(list)
    setIndex(nextIndex)
    indexRef.current = nextIndex
    restorePending.current = true
    applyHeaderHidden(false)
  }

  function bumpCount(id: string, field: "likes" | "bookmarks", delta: number) {
    setPics((currentList) => {
      const next = currentList.map((pic) =>
        pic.id === id ? { ...pic, [field]: Math.max(0, pic[field] + delta) } : pic,
      )
      persist(next, indexRef.current)
      return next
    })
  }

  async function hydrateCounts(list: PackedPic[]) {
    if (list.length === 0) return
    try {
      const response = await fetch("/api/pics/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: list.map((pic) => pic.id) }),
      })
      const data = (await response.json()) as { pics?: PackedPic[] }
      if (!response.ok || !Array.isArray(data.pics) || data.pics.length === 0) return
      const map = new Map(data.pics.map((pic) => [pic.id, normalizePic(pic)]))
      setPics((current) => {
        let changed = false
        const next = current.map((pic) => {
          const hit = map.get(pic.id)
          if (!hit) return pic
          if (hit.likes === pic.likes && hit.bookmarks === pic.bookmarks) return pic
          changed = true
          return { ...pic, likes: hit.likes, bookmarks: hit.bookmarks }
        })
        if (!changed) return current
        persist(next, indexRef.current)
        return next
      })
    } catch {
      // ignore
    }
  }

  async function loadPics(force: boolean) {
    if (!force) {
      if (vip) {
        const cached = readVipSession()
        if (cached) {
          setError(null)
          applyPics(cached.pics, cached.index, false)
          setLoading(false)
          void hydrateCounts(cached.pics)
          return
        }
      } else {
        const cached = readFreePicPack()
        if (cached) {
          setError(null)
          applyPics(cached.pics, cached.index, true)
          setLoading(false)
          void hydrateCounts(cached.pics)
          return
        }
      }
    }

    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/pics")
      const data = (await response.json()) as {
        pics?: PackedPic[]
        limited?: boolean
        error?: string
      }
      if (id !== requestId.current) return
      const next = Array.isArray(data.pics) ? data.pics : []
      const nextLimited = !vip
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
      applyPics(next, 0, nextLimited)
    } catch {
      if (id !== requestId.current) return
      setError("网络不好，稍后再试")
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) {
      applyHeaderHidden(false)
      setSavedListOpen(false)
      if (browsingSaved) {
        feedBackup.current = null
        setBrowsingSaved(false)
      }
      return
    }
    applyHeaderHidden(false)
    setLikedIds(readLocalIds(LIKED_PIC_KEY))
    setSavedIds(readLocalIds(SAVED_PIC_KEY))
    void fetchClientSettings().then(() => {
      void loadPics(false)
    })
    void fetch("/api/auth/me")
      .then(
        (response) =>
          response.json() as Promise<{
            username?: string | null
            likedPicIds?: string[]
            savedPicIds?: string[]
          }>,
      )
      .then((data) => {
        if (!data.username) return
        if (Array.isArray(data.likedPicIds)) {
          setLikedIds(data.likedPicIds)
          writeLocalIds(LIKED_PIC_KEY, data.likedPicIds)
        }
        if (Array.isArray(data.savedPicIds)) {
          setSavedIds(data.savedPicIds)
          writeLocalIds(SAVED_PIC_KEY, data.savedPicIds)
        }
      })
      .catch(() => {})
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
    applyHeaderHidden(next > indexRef.current)
    indexRef.current = next
    setIndex(next)
    persist(pics, next)
  }

  function toggleLike() {
    if (!current) return
    if (!loggedIn) {
      onOpenLogin()
      return
    }
    const adding = !likedIds.includes(current.id)
    const next = adding
      ? [current.id, ...likedIds.filter((id) => id !== current.id)]
      : likedIds.filter((id) => id !== current.id)
    const seq = ++likedSeq.current
    setLikedIds(next)
    writeLocalIds(LIKED_PIC_KEY, next)
    bumpCount(current.id, "likes", adding ? 1 : -1)
    void pushPicIds("liked", next)
      .then((data) => {
        if (seq !== likedSeq.current) return
        if (Array.isArray(data.likedPicIds)) {
          setLikedIds(data.likedPicIds)
          writeLocalIds(LIKED_PIC_KEY, data.likedPicIds)
        }
        const count = data.counts?.[current.id]
        if (typeof count !== "number") return
        setPics((list) => {
          const next = list.map((pic) => {
            if (pic.id !== current.id) return pic
            // 避免服务端偶发 0 把乐观更新盖掉
            if (adding && count < pic.likes) return pic
            return { ...pic, likes: count }
          })
          persist(next, indexRef.current)
          return next
        })
      })
      .catch(() => {})
  }

  function toggleSaved() {
    if (!current) return
    if (!loggedIn) {
      onOpenLogin()
      return
    }
    if (!vip) {
      onOpenVip()
      return
    }
    const targetId = current.id
    const adding = !savedIds.includes(targetId)
    const next = adding
      ? [targetId, ...savedIds.filter((id) => id !== targetId)]
      : savedIds.filter((id) => id !== targetId)
    const seq = ++savedSeq.current
    setSavedIds(next)
    writeLocalIds(SAVED_PIC_KEY, next)
    bumpCount(targetId, "bookmarks", adding ? 1 : -1)
    if (adding) {
      setSavedList((list) => [current, ...list.filter((pic) => pic.id !== targetId)])
    } else {
      setSavedList((list) => list.filter((pic) => pic.id !== targetId))
      if (browsingSaved) {
        setPics((list) => {
          const filtered = list.filter((pic) => pic.id !== targetId)
          const safeIndex = Math.min(filtered.length - 1, Math.max(0, indexRef.current))
          indexRef.current = filtered.length === 0 ? 0 : safeIndex
          setIndex(indexRef.current)
          restorePending.current = true
          return filtered
        })
      }
    }
    void pushPicIds("saved", next)
      .then((data) => {
        if (seq !== savedSeq.current) return
        if (Array.isArray(data.savedPicIds)) {
          setSavedIds(data.savedPicIds)
          writeLocalIds(SAVED_PIC_KEY, data.savedPicIds)
        }
        const count = data.counts?.[targetId]
        if (typeof count !== "number") return
        setPics((list) => {
          const next = list.map((pic) => {
            if (pic.id !== targetId) return pic
            if (adding && count < pic.bookmarks) return pic
            return { ...pic, bookmarks: count }
          })
          persist(next, indexRef.current)
          return next
        })
        setSavedList((list) =>
          list.map((pic) => {
            if (pic.id !== targetId) return pic
            if (adding && count < pic.bookmarks) return pic
            return { ...pic, bookmarks: count }
          }),
        )
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : ""
        if (message.includes("VIP")) onOpenVip()
      })
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
        <header
          className="feed-header absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2"
          data-hidden={headerHidden ? "true" : "false"}
          style={{
            opacity: headerHidden ? 0 : 1,
            transform: headerHidden ? "translate3d(0, -110%, 0)" : "translate3d(0, 0, 0)",
          }}
        >
          <button
            type="button"
            className="grid h-10 w-10 place-items-center text-xl text-white/80"
            onClick={() => {
              if (browsingSaved) {
                exitSavedBrowse()
                return
              }
              onClose()
            }}
            aria-label={browsingSaved ? "返回美图" : "关闭美图"}
          >
            {browsingSaved ? "‹" : "×"}
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold tracking-wide">{browsingSaved ? "收藏" : "美图"}</p>
            <p className="text-[11px] text-white/40">
              {pics.length > 0
                ? `${index + 1} / ${pics.length}`
                : browsingSaved
                  ? "还没有收藏"
                  : limited
                    ? `今日免费 ${freePicLimit()} 张`
                    : "精选美图"}
            </p>
          </div>
          {vip && !browsingSaved ? (
            <button
              type="button"
              className="h-10 rounded-full px-2 text-[13px] text-white/70 disabled:opacity-40"
              disabled={loading || headerHidden}
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
            if (Math.abs(delta) < 48) {
              applyHeaderHidden(false)
              return
            }
            suppressTap.current = true
            applyHeaderHidden(delta > 0)
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
                className="relative flex h-full w-full snap-start snap-always items-center justify-center"
              >
                <img
                  src={pic.src}
                  alt={pic.name}
                  referrerPolicy="no-referrer"
                  className="block h-auto w-full"
                  draggable={false}
                  onClick={() => {
                    if (suppressTap.current) {
                      suppressTap.current = false
                      return
                    }
                    applyHeaderHidden(false)
                  }}
                />
              </article>
            ))
          )}
        </div>

        {current && (
          <div
            className="feed-profile pointer-events-none absolute inset-y-0 right-3 z-20 flex items-center"
            data-hidden={headerHidden ? "true" : "false"}
            style={{
              opacity: headerHidden ? 0 : 1,
              transform: headerHidden ? "translate3d(120%, 0, 0)" : "translate3d(0, 0, 0)",
            }}
          >
            <div
              className={`flex flex-col items-center gap-4 pb-8 ${
                headerHidden ? "pointer-events-none" : "pointer-events-auto"
              }`}
            >
              <RailButton label="点赞" count={current.likes} pressed={liked} onClick={toggleLike}>
                <IconHeart filled={liked} />
              </RailButton>
              <RailButton label="收藏" count={current.bookmarks} pressed={saved} onClick={toggleSaved}>
                <IconBookmark filled={saved} />
              </RailButton>
            </div>
          </div>
        )}

        {loggedIn && (
          <button
            type="button"
            aria-label={`美图收藏${savedIds.length > 0 ? ` ${savedIds.length} 张` : ""}`}
            className="feed-profile absolute right-4 z-30 grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur-sm"
            data-hidden={headerHidden ? "true" : "false"}
            style={{
              bottom: limited
                ? "max(96px, calc(env(safe-area-inset-bottom) + 84px))"
                : "max(18px, env(safe-area-inset-bottom))",
              opacity: headerHidden ? 0 : 1,
              transform: headerHidden ? "translate3d(120%, 0, 0)" : "translate3d(0, 0, 0)",
            }}
            onClick={openSavedList}
          >
            <IconBookmark filled className="h-5 w-5" />
            {savedIds.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#fe2c55] px-1 text-[10px] font-semibold leading-none text-white">
                {formatCount(savedIds.length)}
              </span>
            )}
          </button>
        )}

        {limited && !browsingSaved && (
          <div className="relative z-10 shrink-0 border-t border-white/10 bg-[#141018]/95 px-5 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] backdrop-blur">
            <p className="text-center text-[12px] text-white/45">
              普通用户今日 {readClientSettings().freeDailyPics} 张 · VIP 畅看全部美图
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

        {savedListOpen && (
          <div className="absolute inset-0 z-40 flex flex-col bg-[#0c0a10]">
            <header className="flex shrink-0 items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
              <button
                type="button"
                className="grid h-10 w-10 place-items-center text-xl text-white/80"
                aria-label="关闭收藏列表"
                onClick={() => setSavedListOpen(false)}
              >
                ×
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold tracking-wide">美图收藏</p>
                <p className="text-[11px] text-white/40">
                  {savedListLoading ? "加载中" : `${savedList.length} 张`}
                </p>
              </div>
              <span className="w-10" />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-[max(12px,env(safe-area-inset-bottom))]">
              {savedListLoading ? (
                <div className="grid h-full place-items-center">
                  <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                </div>
              ) : savedListError && savedList.length === 0 ? (
                <div className="grid h-full place-items-center px-8 text-center">
                  <div>
                    <p className="text-lg font-medium">加载失败</p>
                    <p className="mt-2 text-sm leading-6 text-white/55">{savedListError}</p>
                    <button
                      type="button"
                      className="mt-4 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black"
                      onClick={() => void loadSavedList()}
                    >
                      重试
                    </button>
                  </div>
                </div>
              ) : savedList.length === 0 ? (
                <div className="grid h-full place-items-center px-8 text-center">
                  <div>
                    <p className="text-lg font-medium">还没有收藏</p>
                    <p className="mt-2 text-sm leading-6 text-white/55">在美图里点收藏，之后会出现在这里</p>
                    <button
                      type="button"
                      className="mt-4 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black"
                      onClick={() => setSavedListOpen(false)}
                    >
                      去看看
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  {savedList.map((pic) => (
                    <button
                      key={pic.id}
                      type="button"
                      className="relative aspect-[3/4] overflow-hidden bg-white/5"
                      aria-label={`查看 ${pic.name}`}
                      onClick={() => openSavedPic(pic)}
                    >
                      <img
                        src={pic.src}
                        alt={pic.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function RailButton({
  label,
  count,
  pressed,
  onClick,
  children,
}: {
  label: string
  count: number
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="flex flex-col items-center gap-1"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,.55)]">{children}</span>
      <span className="text-shadow text-[12px] font-semibold">{formatCount(count)}</span>
    </button>
  )
}
