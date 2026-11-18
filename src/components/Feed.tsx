"use client"

import { useRouter } from "next/navigation"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { AccountSheet, storeInviteCode } from "@/components/AccountSheet"
import { IconFullscreen, IconUser, IconVolume } from "@/components/icons"
import { PicSheet } from "@/components/PicSheet"
import { VideoSlide } from "@/components/VideoSlide"
import type { VideoFeedResponse, VideoItem } from "@/lib/types"
import { applyClientSettings, fetchClientSettings, readClientSettings } from "@/lib/client-settings"
import { formatCount } from "@/lib/format"
import { readFreePicPack, writeFreePicPack } from "@/lib/pic-pack"
import { DEFAULT_APP_SETTINGS } from "@/lib/settings-types"
import {
  canWatchVideo,
  ensureFreePackIds,
  noteWatchedId,
  readFreePackIds,
  watchedCountToday,
} from "@/lib/watch-limit"

type Tab = "forYou" | "saved"

const SAVED_KEY = "sk_saved"
const LIKED_KEY = "sk_liked"

function readLocalIds(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

function readLocalSaved() {
  return readLocalIds(SAVED_KEY)
}

function readLocalLiked() {
  return readLocalIds(LIKED_KEY)
}

function clearLocalAuthData() {
  try {
    localStorage.removeItem(SAVED_KEY)
    localStorage.removeItem(LIKED_KEY)
    localStorage.removeItem("sk_pic_liked")
    localStorage.removeItem("sk_pic_saved")
    sessionStorage.removeItem("sk_pics_vip")
  } catch {
    // ignore
  }
}

function rememberCounts(
  fixes: { likes: Record<string, number>; bookmarks: Record<string, number> },
  field: "likes" | "bookmarks",
  counts: Record<string, number> | null | undefined,
) {
  if (!counts) return
  Object.assign(fixes[field], counts)
}

function applyCountFixes(videos: VideoItem[], fixes: { likes: Record<string, number>; bookmarks: Record<string, number> }) {
  return videos.map((video) => {
    const likes = fixes.likes[video.id]
    const bookmarks = fixes.bookmarks[video.id]
    if (likes === undefined && bookmarks === undefined) return video
    return {
      ...video,
      likes: likes ?? video.likes,
      bookmarks: bookmarks ?? video.bookmarks,
    }
  })
}

function paintCounts(
  setVideos: Dispatch<SetStateAction<VideoItem[]>>,
  field: "likes" | "bookmarks",
  counts: Record<string, number> | null | undefined,
) {
  if (!counts || Object.keys(counts).length === 0) return
  setVideos((current) =>
    current.map((video) => {
      const value = counts[video.id]
      return typeof value === "number" ? { ...video, [field]: value } : video
    }),
  )
}

let savedChain: Promise<unknown> = Promise.resolve()
let likedChain: Promise<unknown> = Promise.resolve()

function pushIds(kind: "saved" | "liked", ids: string[]) {
  localStorage.setItem(kind === "saved" ? SAVED_KEY : LIKED_KEY, JSON.stringify(ids))
  const run = async () => {
    const response = await fetch(kind === "saved" ? "/api/auth/saved" : "/api/auth/likes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "saved" ? { savedIds: ids } : { likedIds: ids }),
    })
    if (!response.ok) return null
    const data = (await response.json()) as { counts?: Record<string, number> }
    return data.counts ?? {}
  }
  const chain = kind === "saved" ? savedChain : likedChain
  const next = chain.then(run, run)
  if (kind === "saved") savedChain = next
  else likedChain = next
  return next
}

function mergeIds(remote: string[], local: string[]) {
  const next = [...remote]
  for (const id of local) {
    if (!next.includes(id)) next.push(id)
  }
  return next
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export function Feed() {
  const router = useRouter()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(0)
  const forYouIndex = useRef(0)
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [mode, setMode] = useState<VideoFeedResponse["mode"] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("forYou")
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [banner, setBanner] = useState(true)
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const [toastOn, setToastOn] = useState(false)
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [likedIds, setLikedIds] = useState<string[]>([])
  const [profileOpen, setProfileOpen] = useState(false)
  const [user, setUser] = useState<{
    username: string
    vip: boolean
    vipUntil?: string | null
    inviteCode?: string | null
    inviteCount?: number
    inviteVipCount?: number
    inviteNeed?: number
  } | null>(null)
  const [vipOpen, setVipOpen] = useState(false)
  const [picsOpen, setPicsOpen] = useState(false)
  const [picThumb, setPicThumb] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [watchBlocked, setWatchBlocked] = useState(false)
  const [headerHidden, setHeaderHidden] = useState(false)
  const [limits, setLimits] = useState(DEFAULT_APP_SETTINGS)
  const profileRef = useRef(false)
  const vipRef = useRef(false)
  const picsRef = useRef(false)
  const vipUserRef = useRef(false)
  const listRef = useRef<VideoItem[]>([])
  const tabRef = useRef<Tab>(tab)
  const headerHiddenRef = useRef(false)
  const touchStartY = useRef<number | null>(null)
  const countFixes = useRef<{ likes: Record<string, number>; bookmarks: Record<string, number> }>({
    likes: {},
    bookmarks: {},
  })
  const savedSeq = useRef(0)
  const likedSeq = useRef(0)
  profileRef.current = profileOpen || vipOpen || picsOpen
  vipRef.current = vipOpen
  picsRef.current = picsOpen
  vipUserRef.current = user?.vip === true
  tabRef.current = tab

  const pausedRef = useRef(paused)
  const mutedRef = useRef(muted)

  useEffect(() => {
    activeRef.current = active
    if (tab === "forYou") forYouIndex.current = active
    pausedRef.current = paused
    mutedRef.current = muted
    profileRef.current = profileOpen || vipOpen || picsOpen
    vipRef.current = vipOpen
    picsRef.current = picsOpen
    vipUserRef.current = user?.vip === true
    tabRef.current = tab
  }, [active, paused, muted, profileOpen, vipOpen, picsOpen, tab, user?.vip])

  useEffect(() => {
    if (picsOpen) setPaused(true)
  }, [picsOpen])

  useEffect(() => {
    if (!user?.vip) {
      const cached = readFreePicPack()
      if (cached?.pics[0]?.src) {
        setPicThumb(cached.pics[0].src)
        return
      }
    }
    const controller = new AbortController()
    fetch("/api/pics", { signal: controller.signal })
      .then((response) => response.json() as Promise<{ pics?: { src?: string; name?: string; id?: string }[] }>)
      .then((data) => {
        const list = Array.isArray(data.pics) ? data.pics : []
        const first = list.find((item) => typeof item.src === "string" && item.src)
        if (first?.src) setPicThumb(first.src)
        if (!user?.vip && list.length > 0) {
          writeFreePicPack(
            list.flatMap((item) =>
              typeof item.id === "string" && typeof item.src === "string"
                ? [{ id: item.id, name: typeof item.name === "string" ? item.name : "美图", src: item.src }]
                : [],
            ),
            0,
          )
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [user?.vip])

  const list = useMemo(() => {
    if (tab === "saved") {
      const byId = new Map(videos.map((video) => [video.id, video]))
      return savedIds.flatMap((id) => {
        const video = byId.get(id)
        return video ? [video] : []
      })
    }
    if (user?.vip) return videos
    if (videos.length === 0) return []
    const ids = readFreePackIds()
    const byId = new Map(videos.map((video) => [video.id, video]))
    const packed = ids.flatMap((id) => {
      const video = byId.get(id)
      return video ? [video] : []
    })
    return packed.length > 0 ? packed : videos.slice(0, readClientSettings().freeDailyVideos)
  }, [tab, videos, savedIds, user?.vip, limits.freeDailyVideos])
  listRef.current = list

  function allowIndex(index: number) {
    if (vipUserRef.current || tabRef.current !== "forYou") return true
    const video = listRef.current[index]
    if (!video) return false
    return canWatchVideo(video.id, false)
  }

  const limitBlocked =
    !user?.vip && tab === "forYou" && !!list[active] && !canWatchVideo(list[active].id, false)

  useEffect(() => {
    if (tab !== "forYou") {
      setWatchBlocked(false)
      return
    }
    if (user?.vip) {
      setWatchBlocked(false)
      return
    }
    const video = list[active]
    if (!video) return
    if (canWatchVideo(video.id, false)) {
      noteWatchedId(video.id)
      setWatchBlocked(false)
      return
    }
    setWatchBlocked(true)
    setPaused(true)
    const root = scrollerRef.current
    const pick = (() => {
      for (let index = active - 1; index >= 0; index -= 1) {
        if (canWatchVideo(list[index]?.id ?? "", false)) return index
      }
      for (let index = active + 1; index < list.length; index += 1) {
        if (canWatchVideo(list[index]?.id ?? "", false)) return index
      }
      return -1
    })()
    if (pick < 0) return
    activeRef.current = pick
    setActive(pick)
    if (root && root.clientHeight > 0) root.scrollTop = pick * root.clientHeight
    noteWatchedId(list[pick].id)
    setWatchBlocked(false)
    setPaused(false)
  }, [active, list, tab, user?.vip])

  useEffect(() => {
    const controller = new AbortController()
    void fetchClientSettings()
      .then((settings) => {
        setLimits({ ...settings })
        return fetch("/api/videos", { signal: controller.signal })
      })
      .then((response) => response.json() as Promise<VideoFeedResponse>)
      .then((data) => {
        const all = applyCountFixes(shuffle(data.videos ?? []), countFixes.current)
        ensureFreePackIds(all.map((video) => video.id))
        setVideos(all)
        setMode(data.mode)
        setError(data.error ?? null)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setError("视频列表加载失败")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const code = params.get("invite")
      if (code) storeInviteCode(code)
      if (params.get("login") === "1") {
        setProfileOpen(true)
        params.delete("login")
        const next = params.toString()
        window.history.replaceState(null, "", next ? `/?${next}` : "/")
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const local = readLocalSaved()
    const localLiked = readLocalLiked()
    if (local.length > 0) setSavedIds(local)
    if (localLiked.length > 0) setLikedIds(localLiked)
    const controller = new AbortController()
    fetch("/api/auth/me", { signal: controller.signal })
      .then((response) =>
        response.json() as Promise<{
          username?: string | null
          vip?: boolean
          vipUntil?: string | null
          inviteCode?: string | null
          inviteCount?: number
          inviteVipCount?: number
          inviteNeed?: number
          freeDailyVideos?: number
          freeDailyPics?: number
          savedIds?: string[]
          likedIds?: string[]
        }>,
      )
      .then((data) => {
        const latestLocal = readLocalSaved()
        const latestLiked = readLocalLiked()
        const settings = applyClientSettings({
          freeDailyVideos: data.freeDailyVideos,
          freeDailyPics: data.freeDailyPics,
          inviteNeed: data.inviteNeed,
        })
        setLimits({ ...settings })
        if (!data.username) {
          setUser(null)
          setAuthReady(true)
          clearLocalAuthData()
          setSavedIds([])
          setLikedIds([])
          return
        }
        setAuthReady(true)
        setUser({
          username: data.username,
          vip: data.vip === true,
          vipUntil: data.vipUntil ?? null,
          inviteCode: data.inviteCode ?? null,
          inviteCount: data.inviteCount ?? 0,
          inviteVipCount: data.inviteVipCount ?? 0,
          inviteNeed: data.inviteNeed ?? settings.inviteNeed,
        })
        const remote = Array.isArray(data.savedIds) ? data.savedIds.filter((id) => typeof id === "string") : []
        const remoteLiked = Array.isArray(data.likedIds) ? data.likedIds.filter((id) => typeof id === "string") : []
        if (data.vip === true) {
          setSavedIds((current) => {
            const merged = mergeIds(remote, mergeIds(latestLocal, current))
            if (!sameIds(merged, remote)) {
              void pushIds("saved", merged).then((counts) => {
                rememberCounts(countFixes.current, "bookmarks", counts)
                paintCounts(setVideos, "bookmarks", counts)
              })
            } else localStorage.setItem(SAVED_KEY, JSON.stringify(merged))
            return merged
          })
        } else {
          setSavedIds([])
          try {
            localStorage.removeItem(SAVED_KEY)
          } catch {
            // ignore
          }
        }
        setLikedIds((current) => {
          const merged = mergeIds(remoteLiked, mergeIds(latestLiked, current))
          if (!sameIds(merged, remoteLiked)) {
            void pushIds("liked", merged).then((counts) => {
              rememberCounts(countFixes.current, "likes", counts)
              paintCounts(setVideos, "likes", counts)
            })
          } else localStorage.setItem(LIKED_KEY, JSON.stringify(merged))
          return merged
        })
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setAuthReady(true)
      })
    return () => controller.abort()
  }, [])

  useLayoutEffect(() => {
    const root = scrollerRef.current
    if (!root) return
    const apply = () => root.style.setProperty("--slide-h", `${root.clientHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const root = scrollerRef.current
    if (!root || list.length === 0) return
    const syncToScroll = () => {
      if (root.clientHeight === 0) return
      const index = Math.min(list.length - 1, Math.max(0, Math.round(root.scrollTop / root.clientHeight)))
      if (!allowIndex(index)) {
        const fallback = Math.max(0, activeRef.current)
        root.scrollTop = fallback * root.clientHeight
        if (!profileRef.current) setVipOpen(true)
        return
      }
      if (index === activeRef.current) return
      applyHeaderHidden(index > activeRef.current)
      activeRef.current = index
      pauseOtherVideos(root, index)
      setActive(index)
      setPaused(false)
    }
    const observer = new IntersectionObserver(syncToScroll, {
      root,
      threshold: [0.6],
    })
    root.querySelectorAll<HTMLElement>("[data-index]").forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [list])

  useEffect(() => {
    const root = scrollerRef.current
    if (!root) return
    let locked = false
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      event.preventDefault()
      if (locked || profileRef.current || list.length === 0 || root.clientHeight === 0) return
      if (Math.abs(event.deltaY) < 6) return
      locked = true
      const current = Math.round(root.scrollTop / root.clientHeight)
      const next = Math.min(list.length - 1, Math.max(0, current + (event.deltaY > 0 ? 1 : -1)))
      if (event.deltaY > 0 && next === current && !vipUserRef.current && tabRef.current === "forYou") {
        locked = false
        if (!profileRef.current) setVipOpen(true)
        return
      }
      if (event.deltaY > 0 && !allowIndex(next)) {
        locked = false
        if (!profileRef.current) setVipOpen(true)
        return
      }
      applyHeaderHidden(event.deltaY > 0)
      root.scrollTo({ top: next * root.clientHeight, behavior: "smooth" })
      window.setTimeout(() => {
        locked = false
      }, 520)
    }
    const onTouchStart = (event: TouchEvent) => {
      touchStartY.current = event.touches[0]?.clientY ?? null
    }
    const onTouchEnd = (event: TouchEvent) => {
      const start = touchStartY.current
      touchStartY.current = null
      if (start == null || profileRef.current) return
      const end = event.changedTouches[0]?.clientY
      if (end == null) return
      const dy = start - end
      if (Math.abs(dy) < 24) return
      applyHeaderHidden(dy > 0)
    }
    const onScroll = () => {
      if (root.clientHeight === 0 || list.length === 0) return
      const top = root.scrollTop
      const index = Math.min(list.length - 1, Math.max(0, Math.round(top / root.clientHeight)))
      if (!allowIndex(index)) {
        const fallback = Math.max(0, activeRef.current)
        if (root.clientHeight > 0) root.scrollTop = fallback * root.clientHeight
        if (!profileRef.current) setVipOpen(true)
        return
      }
      pauseOtherVideos(root, index)
      if (index === activeRef.current) return
      applyHeaderHidden(index > activeRef.current)
      activeRef.current = index
      setActive(index)
      setPaused(false)
    }
    root.addEventListener("wheel", onWheel, { passive: false })
    root.addEventListener("touchstart", onTouchStart, { passive: true })
    root.addEventListener("touchend", onTouchEnd, { passive: true })
    root.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      root.removeEventListener("wheel", onWheel)
      root.removeEventListener("touchstart", onTouchStart)
      root.removeEventListener("touchend", onTouchEnd)
      root.removeEventListener("scroll", onScroll)
    }
  }, [list.length])

  useEffect(() => {
    let lastTouch = 0
    const stopDoubleTapZoom = (event: TouchEvent) => {
      const now = Date.now()
      if (now - lastTouch < 300) event.preventDefault()
      lastTouch = now
    }
    const stopGesture = (event: Event) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      event.preventDefault()
    }
    document.addEventListener("touchend", stopDoubleTapZoom, { passive: false })
    document.addEventListener("gesturestart", stopGesture)
    document.addEventListener("dblclick", stopGesture)
    return () => {
      document.removeEventListener("touchend", stopDoubleTapZoom)
      document.removeEventListener("gesturestart", stopGesture)
      document.removeEventListener("dblclick", stopGesture)
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && profileRef.current) {
        if (vipRef.current) setVipOpen(false)
        else if (picsRef.current) setPicsOpen(false)
        else setProfileOpen(false)
        return
      }
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (profileRef.current) return
      const root = scrollerRef.current
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        if (!root || list.length === 0 || root.clientHeight === 0) return
        const current = Math.round(root.scrollTop / root.clientHeight)
        const next = Math.min(
          list.length - 1,
          Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)),
        )
        if (event.key === "ArrowDown" && next === current && !vipUserRef.current && tabRef.current === "forYou") {
          if (!profileRef.current) setVipOpen(true)
          return
        }
        if (event.key === "ArrowDown" && !allowIndex(next)) {
          if (!profileRef.current) setVipOpen(true)
          return
        }
        applyHeaderHidden(event.key === "ArrowDown")
        root.scrollTo({ top: next * root.clientHeight, behavior: "smooth" })
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault()
        if (event.repeat) return
        const element = root?.querySelector<HTMLVideoElement>("[data-active='true'] video")
        if (!element) return
        const duration = element.duration
        if (!Number.isFinite(duration) || duration <= 0) return
        const delta = event.key === "ArrowRight" ? 5 : -5
        const next = Math.min(duration, Math.max(0, element.currentTime + delta))
        if (Math.abs(next - element.currentTime) < 0.2) {
          showToast(delta > 0 ? "已经是结尾" : "已经是开头")
          return
        }
        element.currentTime = next
        showToast(`${delta > 0 ? "快进" : "快退"} ${formatClock(next)}`)
      } else if (event.key === " ") {
        event.preventDefault()
        const nextPaused = !pausedRef.current
        const element = root?.querySelector<HTMLVideoElement>("[data-active='true'] video")
        if (element) {
          if (nextPaused) element.pause()
          else void element.play().catch(() => {})
        }
        setPaused(nextPaused)
      } else if (event.key === "m" || event.key === "M") {
        event.preventDefault()
        const next = !mutedRef.current
        const element = root?.querySelector<HTMLVideoElement>("[data-active='true'] video")
        if (element) {
          element.muted = next
          if (!next) void element.play().catch(() => {})
        }
        mutedRef.current = next
        setMuted(next)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [list.length])

  useEffect(() => {
    const root = scrollerRef.current
    if (!root) return
    root.style.overflowY = profileOpen || vipOpen || picsOpen ? "hidden" : "auto"
  }, [profileOpen, vipOpen, picsOpen])

  useLayoutEffect(() => {
    if (!toast) return
    setToastOn(false)
  }, [toast])

  useEffect(() => {
    if (!toast) return
    const enter = window.requestAnimationFrame(() => setToastOn(true))
    const fade = window.setTimeout(() => setToastOn(false), 500)
    const clear = window.setTimeout(() => setToast(null), 680)
    return () => {
      window.cancelAnimationFrame(enter)
      window.clearTimeout(fade)
      window.clearTimeout(clear)
    }
  }, [toast])

  function showToast(text: string) {
    setToast({ text, id: Date.now() })
  }

  function applyHeaderHidden(hidden: boolean) {
    if (headerHiddenRef.current === hidden) return
    headerHiddenRef.current = hidden
    setHeaderHidden(hidden)
  }

  function pauseOtherVideos(root: HTMLElement, keep: number) {
    root.querySelectorAll<HTMLElement>("[data-index]").forEach((slide) => {
      if (Number(slide.dataset.index) === keep) return
      slide.querySelector("video")?.pause()
    })
  }

function activeVideo() {
    return scrollerRef.current?.querySelector<HTMLVideoElement>("[data-active='true'] video") ?? null
  }

  function setPlayback(nextPaused: boolean) {
    const element = activeVideo()
    if (element) {
      if (nextPaused) element.pause()
      else void element.play().catch(() => {})
    }
    setPaused(nextPaused)
  }

  function changeCount(id: string, field: "likes" | "bookmarks", delta: number) {
    setVideos((current) =>
      current.map((video) => {
        if (video.id !== id) return video
        const value = Math.max(0, video[field] + delta)
        countFixes.current[field][id] = value
        return { ...video, [field]: value }
      }),
    )
  }

  function toggleSaved(id: string) {
    if (authReady && !user) {
      setProfileOpen(true)
      return
    }
    if (authReady && user && !user.vip) {
      setVipOpen(true)
      return
    }
    const adding = !savedIds.includes(id)
    const next = adding ? [id, ...savedIds.filter((item) => item !== id)] : savedIds.filter((item) => item !== id)
    const seq = ++savedSeq.current
    setSavedIds(next)
    if (user) changeCount(id, "bookmarks", adding ? 1 : -1)
    void pushIds("saved", next).then((counts) => {
      if (seq !== savedSeq.current) return
      if (counts) {
        rememberCounts(countFixes.current, "bookmarks", counts)
        paintCounts(setVideos, "bookmarks", counts)
        return
      }
      if (user) changeCount(id, "bookmarks", adding ? -1 : 1)
    })
  }

  function toggleLike(id: string) {
    if (authReady && !user) {
      setProfileOpen(true)
      return
    }
    const adding = !likedIds.includes(id)
    const next = adding ? [...likedIds, id] : likedIds.filter((item) => item !== id)
    const seq = ++likedSeq.current
    setLikedIds(next)
    if (user) changeCount(id, "likes", adding ? 1 : -1)
    void pushIds("liked", next).then((counts) => {
      if (seq !== likedSeq.current) return
      if (counts) {
        rememberCounts(countFixes.current, "likes", counts)
        paintCounts(setVideos, "likes", counts)
        return
      }
      if (user) changeCount(id, "likes", adding ? -1 : 1)
    })
  }

  function onAccount(
    next: {
      username: string
      vip: boolean
      vipUntil?: string | null
      inviteCode?: string | null
      inviteCount?: number
      inviteVipCount?: number
      inviteNeed?: number
    } | null,
  ) {
    if (!next) {
      clearLocalAuthData()
      setSavedIds([])
      setLikedIds([])
      setUser(null)
      if (tabRef.current === "saved") {
        activeRef.current = forYouIndex.current
        setTab("forYou")
        setActive(forYouIndex.current)
      }
      return
    }
    setUser(next)
    void fetch("/api/auth/me")
      .then((response) =>
        response.json() as Promise<{
          vip?: boolean
          vipUntil?: string | null
          inviteCode?: string | null
          inviteCount?: number
          inviteVipCount?: number
          inviteNeed?: number
          savedIds?: string[]
          likedIds?: string[]
        }>,
      )
      .then((data) => {
        const remote = Array.isArray(data.savedIds) ? data.savedIds.filter((id) => typeof id === "string") : []
        const remoteLiked = Array.isArray(data.likedIds) ? data.likedIds.filter((id) => typeof id === "string") : []
        const vip = data.vip === true
        setUser((current) =>
          current
            ? {
                ...current,
                vip,
                vipUntil: data.vipUntil ?? current.vipUntil ?? null,
                inviteCode: data.inviteCode ?? current.inviteCode ?? null,
                inviteCount: data.inviteCount ?? current.inviteCount ?? 0,
                inviteVipCount: data.inviteVipCount ?? current.inviteVipCount ?? 0,
                inviteNeed: data.inviteNeed ?? current.inviteNeed ?? 5,
              }
            : current,
        )
        if (vip) {
          setSavedIds((current) => {
            const merged = mergeIds(remote, current)
            if (!sameIds(merged, remote)) {
              void pushIds("saved", merged).then((counts) => {
                rememberCounts(countFixes.current, "bookmarks", counts)
                paintCounts(setVideos, "bookmarks", counts)
              })
            } else localStorage.setItem(SAVED_KEY, JSON.stringify(merged))
            return merged
          })
        } else {
          setSavedIds([])
          try {
            localStorage.removeItem(SAVED_KEY)
          } catch {
            // ignore
          }
        }
        setLikedIds((current) => {
          const merged = mergeIds(remoteLiked, current)
          if (!sameIds(merged, remoteLiked)) {
            void pushIds("liked", merged).then((counts) => {
              rememberCounts(countFixes.current, "likes", counts)
              paintCounts(setVideos, "likes", counts)
            })
          } else localStorage.setItem(LIKED_KEY, JSON.stringify(merged))
          return merged
        })
      })
      .catch(() => {})
  }

  function goVip() {
    setVipOpen(false)
    setProfileOpen(false)
    setPicsOpen(false)
    router.push("/vip")
  }

  function selectTab(next: Tab) {
    if (next === tab) return
    if (tab === "forYou") forYouIndex.current = activeRef.current
    const index = next === "forYou" ? forYouIndex.current : 0
    activeRef.current = index
    applyHeaderHidden(false)
    setTab(next)
    setActive(index)
    setPaused(false)
  }

  useLayoutEffect(() => {
    const root = scrollerRef.current
    if (!root || root.clientHeight === 0) return
    const count = root.querySelectorAll("[data-index]").length
    const index = tab === "forYou" ? Math.min(forYouIndex.current, Math.max(0, count - 1)) : 0
    activeRef.current = index
    root.scrollTop = index * root.clientHeight
  }, [tab])

  useEffect(() => {
    if (tab !== "saved" || list.length === 0 || activeRef.current < list.length) return
    const index = list.length - 1
    const root = scrollerRef.current
    activeRef.current = index
    setActive(index)
    if (root && root.clientHeight > 0) root.scrollTo({ top: index * root.clientHeight })
  }, [list.length, tab])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  function toggleFullscreen() {
    const stage = stageRef.current
    if (!stage) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    void stage.requestFullscreen().catch(() => {})
  }

  function toggleMute() {
    const next = !muted
    const element = activeVideo()
    if (element) {
      element.muted = next
      if (!next) void element.play().catch(() => {})
    }
    setMuted(next)
  }

  const showBanner = mode === "demo" && banner
  const chromeHidden = headerHidden && !paused && !watchBlocked && !limitBlocked
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-[#1a1020] text-white">
      <div
        ref={stageRef}
        className="stage relative h-dvh w-full overflow-hidden sm:h-[min(100dvh,860px)] sm:w-[400px] sm:rounded-[28px] sm:ring-1 sm:ring-white/10"
      >
        <div ref={scrollerRef} className="feed-scroller">
          {loading ? (
            <div className="feed-slide grid place-items-center">
              <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            </div>
          ) : error && videos.length === 0 ? (
            <div className="feed-slide grid place-items-center px-8 text-center">
              <div>
                <p className="text-lg font-medium">没有播出来</p>
                <p className="mt-2 text-sm leading-6 text-white/60">{error}</p>
              </div>
            </div>
          ) : tab === "saved" && authReady && !user?.vip ? (
            <div className="feed-slide grid place-items-center px-8 text-center">
              <div>
                <p className="text-lg font-medium">收藏只对 VIP 开放</p>
                <button
                  type="button"
                  className="mt-4 rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] px-4 py-1.5 text-sm font-semibold text-white"
                  onClick={() => (user ? goVip() : setProfileOpen(true))}
                >
                  {user ? "开通 VIP" : "去登录"}
                </button>
              </div>
            </div>
          ) : list.length === 0 ? (
            <div className="feed-slide grid place-items-center px-8 text-center">
              <div>
                <p className="text-lg font-medium">还没有收藏</p>
                <button
                  type="button"
                  className="mt-4 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black"
                  onClick={() => selectTab("forYou")}
                >
                  去推荐看看
                </button>
              </div>
            </div>
          ) : (
            list.map((video, index) =>
              Math.abs(index - active) > 3 ? (
                <div key={video.id} data-index={index} className="feed-slide" />
              ) : (
                <VideoSlide
                  key={video.id}
                  video={video}
                  index={index}
                  active={index === active}
                  preload={Math.abs(index - active) <= 1}
                  muted={muted}
                  paused={paused || watchBlocked || limitBlocked}
                  saved={savedIds.includes(video.id)}
                  liked={likedIds.includes(video.id)}
                  onPausedChange={setPlayback}
                  onToggleSaved={() => toggleSaved(video.id)}
                  onToggleLike={() => toggleLike(video.id)}
                />
              ),
            )
          )}
        </div>

        <header
          className="feed-header pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-3 pt-[max(10px,env(safe-area-inset-top))]"
          data-hidden={chromeHidden ? "true" : "false"}
          style={{
            opacity: chromeHidden ? 0 : 1,
            transform: chromeHidden ? "translate3d(0, -110%, 0)" : "translate3d(0, 0, 0)",
          }}
        >
          <button
            type="button"
            className="pointer-events-auto relative mt-0.5 flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/25"
            aria-label="美图"
            onClick={() => setPicsOpen(true)}
          >
            {picThumb ? (
              <img src={picThumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center bg-gradient-to-br from-[#fe2c55]/80 to-[#25f4ee]/70 text-[10px] font-semibold tracking-wide">
                美图
              </span>
            )}
            {picThumb && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/45 py-px text-center text-[9px] font-semibold leading-none text-white/95">
                美图
              </span>
            )}
          </button>
          <nav className="pointer-events-auto flex items-center gap-6 pt-1 text-[17px] font-semibold">
            <TabButton
              active={tab === "saved"}
              badge={user?.vip && savedIds.length > 0 ? formatCount(savedIds.length) : undefined}
              onClick={() => selectTab("saved")}
            >
              收藏
            </TabButton>
            <TabButton active={tab === "forYou"} onClick={() => selectTab("forYou")}>
              推荐
            </TabButton>
          </nav>
          <div className="flex items-center">
            <button
              type="button"
              className="pointer-events-auto hidden h-10 w-10 place-items-center sm:grid"
              aria-label={fullscreen ? "退出全屏" : "全屏"}
              onClick={toggleFullscreen}
            >
              <IconFullscreen active={fullscreen} />
            </button>
            <button
              type="button"
              className="pointer-events-auto grid h-10 w-10 place-items-center"
              aria-label={muted ? "打开声音" : "静音"}
              onClick={toggleMute}
            >
              <IconVolume muted={muted} />
            </button>
          </div>
        </header>

        {!loading && tab === "saved" && user?.vip && list.length > 0 && (
          <div
            className="feed-profile pointer-events-none absolute left-4 bottom-[max(22px,env(safe-area-inset-bottom))] z-30 pb-1"
            data-hidden={chromeHidden ? "true" : "false"}
            style={{
              opacity: chromeHidden ? 0 : 1,
              transform: chromeHidden ? "translate3d(-120%, 0, 0)" : "translate3d(0, 0, 0)",
            }}
            aria-hidden={chromeHidden}
          >
            <p className="text-shadow text-[13px] font-semibold tracking-wide text-white/90">
              {Math.min(list.length, Math.max(1, active + 1))} / {list.length}
            </p>
          </div>
        )}

        {!loading && (
          <button
            type="button"
            aria-label="个人中心"
            className="feed-profile absolute right-4 bottom-[max(18px,env(safe-area-inset-bottom))] z-30 grid place-items-center pb-1"
            data-hidden={chromeHidden ? "true" : "false"}
            style={{
              opacity: chromeHidden ? 0 : 1,
              transform: chromeHidden ? "translate3d(120%, 0, 0)" : "translate3d(0, 0, 0)",
            }}
            onClick={() => setProfileOpen(true)}
          >
            <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 border-white/80 bg-gradient-to-br from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-base font-semibold text-white">
              {user?.username ? Array.from(user.username)[0] : <IconUser />}
            </span>
          </button>
        )}

        {showBanner && (
          <div className="absolute inset-x-3 top-14 z-30 flex items-start gap-3 rounded-2xl bg-black/60 px-3 py-2 text-[12px] leading-5 text-white/90 backdrop-blur-md">
            <p className="flex-1">
              正在播放公开示例流。把 m3u8 上传到 R2 后，在 .env.local 填写 NEXT_PUBLIC_R2_PUBLIC_BASE。
            </p>
            <button
              type="button"
              className="shrink-0 text-white/70"
              onClick={() => setBanner(false)}
            >
              关闭
            </button>
          </div>
        )}

        {muted && !showBanner && !loading && list.length > 0 && (
          <button
            type="button"
            className="absolute left-1/2 top-[4.5rem] z-30 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs backdrop-blur"
            onClick={toggleMute}
          >
            点击打开声音
          </button>
        )}

        {toast && (
          <div
            className={`pointer-events-none absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-[calc(50%+4.5rem)] rounded-lg bg-black/40 px-4 py-2 text-sm backdrop-blur-md transition-opacity duration-150 ease-out ${toastOn ? "opacity-100" : "opacity-0"}`}
          >
            {toast.text}
          </div>
        )}
        <AccountSheet
          open={profileOpen}
          user={user}
          savedCount={savedIds.length}
          onClose={() => setProfileOpen(false)}
          onUser={onAccount}
          onOpenVip={goVip}
        />
        <PicSheet
          open={picsOpen}
          vip={user?.vip === true}
          loggedIn={Boolean(user)}
          onClose={() => setPicsOpen(false)}
          onOpenVip={goVip}
          onOpenLogin={() => setProfileOpen(true)}
        />
        <div inert={!vipOpen} className={`absolute inset-0 z-40 ${vipOpen ? "" : "pointer-events-none"}`}>
          <button
            type="button"
            aria-label="关闭 VIP"
            className={`absolute inset-0 bg-black/45 transition-opacity ${vipOpen ? "opacity-100" : "opacity-0"}`}
            onClick={() => setVipOpen(false)}
          />
          <section
            className={`absolute inset-x-0 bottom-0 rounded-t-2xl bg-[#161018] px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] text-white shadow-2xl transition-transform duration-300 ${
              vipOpen ? "translate-y-0" : "translate-y-full"
            }`}
            aria-hidden={!vipOpen}
          >
            <h2 className="text-center text-base font-semibold">开通 VIP</h2>
            {watchBlocked && (
              <p className="mt-2 text-center text-sm text-[#ff8aa3]">
                今日免费 {limits.freeDailyVideos} 条已看完（已看{" "}
                {Math.min(limits.freeDailyVideos, watchedCountToday())} 条）
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 text-left text-[13px]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                <p className="text-[12px] text-white/40">普通用户</p>
                <ul className="mt-2 space-y-1.5 text-white/65">
                  <li>每天 {limits.freeDailyVideos} 条视频</li>
                  <li>不能收藏</li>
                  <li>每天 {limits.freeDailyPics} 张美图</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-[#25f4ee]/25 bg-[linear-gradient(160deg,rgba(254,44,85,0.14),rgba(37,244,238,0.1))] px-3 py-3">
                <p className="text-[12px] font-semibold text-[#25f4ee]">VIP</p>
                <ul className="mt-2 space-y-1.5 text-white">
                  <li>无限观看</li>
                  <li>可收藏视频</li>
                  <li>无限美图</li>
                </ul>
              </div>
            </div>
            <button
              type="button"
              className="mt-5 h-11 w-full rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-sm font-semibold text-white"
              onClick={goVip}
            >
              开通 VIP
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

function shuffle<T>(items: T[]) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const current = next[index]
    next[index] = next[swap]
    next[swap] = current
  }
  return next
}

function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const remain = total % 60
  return `${minutes}:${remain.toString().padStart(2, "0")}`
}

function TabButton({
  active,
  badge,
  onClick,
  children,
}: {
  active: boolean
  badge?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button type="button" className={`relative ${active ? "text-white" : "text-white/50"}`} onClick={onClick}>
      {children}
      {badge ? (
        <span className="absolute -right-3.5 -top-1.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#fe2c55] px-1 text-[10px] font-semibold leading-none text-white">
          {badge}
        </span>
      ) : null}
      {active && <span className="absolute -bottom-1.5 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-white" />}
    </button>
  )
}
