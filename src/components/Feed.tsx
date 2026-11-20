"use client"

import { useRouter } from "next/navigation"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { AccountSheet, storeInviteCode } from "@/components/AccountSheet"
import { IconBookmark, IconFullscreen, IconLang, IconToFirst, IconUser, IconVolume } from "@/components/icons"
import { useLocale, useT } from "@/components/LocaleProvider"
import { MovieList } from "@/components/MovieList"
import { MoviePlayer } from "@/components/MoviePlayer"
import { MovieSavedSheet } from "@/components/MovieSavedSheet"
import { PicSheet } from "@/components/PicSheet"
import { VideoSlide } from "@/components/VideoSlide"
import type { MovieItem, MoviesPageResponse } from "@/lib/movies"
import type { VideoFeedResponse, VideoItem } from "@/lib/types"
import { applyClientSettings, fetchClientSettings, readClientSettings } from "@/lib/client-settings"
import { formatCount } from "@/lib/format"
import {
  exitFullscreen,
  isFullscreenFor,
  requestFullscreen,
  subscribeFullscreenChange,
} from "@/lib/fullscreen"
import { detectLocale, translate } from "@/lib/i18n"
import { readFreePicPack, writeFreePicPack } from "@/lib/pic-pack"
import { DEFAULT_APP_SETTINGS } from "@/lib/settings-types"
import { noteAuthResponse, SESSION_KICKED_EVENT } from "@/lib/session-client"
import {
  canWatchMovie,
  canWatchVideo,
  ensureFreeMoviePackIds,
  ensureFreePackIds,
  noteWatchedId,
  noteWatchedMovieId,
  readFreePackIds,
  watchedCountToday,
  watchedMovieCountToday,
} from "@/lib/watch-limit"

type Tab = "forYou" | "saved" | "movies"

const SAVED_KEY = "sk_saved"
const LIKED_KEY = "sk_liked"
const MOVIE_SAVED_KEY = "sk_movie_saved"
const MOVIE_LIKED_KEY = "sk_movie_liked"
const LOOP_KEY = "sk_loop_one"
const SAVED_CURSOR_KEY = "sk_saved_cursor"
const VIDEO_SEEN_KEY = "sk_video_seen"
const VIDEO_PAGE_SIZE = 40
const MOVIE_PAGE_SIZE = 40
/** 与服务端一致：一轮内尽量排除整库已看过的 */
const VIDEO_EXCLUDE_MAX = 50_000
const LOAD_MORE_REMAINING = 8

type VideosPageResponse = VideoFeedResponse & { hasMore?: boolean }

function rememberSeen(seen: string[], ids: string[]) {
  const next = [...seen]
  const have = new Set(next)
  for (const id of ids) {
    if (!id || have.has(id)) continue
    have.add(id)
    next.push(id)
  }
  if (next.length > VIDEO_EXCLUDE_MAX) next.splice(0, next.length - VIDEO_EXCLUDE_MAX)
  return next
}

function readVideoSeen() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIDEO_SEEN_KEY) || "[]") as unknown
    if (!Array.isArray(parsed)) return []
    return rememberSeen(
      [],
      parsed.filter((id): id is string => typeof id === "string" && id.length > 0),
    )
  } catch {
    return []
  }
}

function writeVideoSeen(ids: string[]) {
  try {
    localStorage.setItem(VIDEO_SEEN_KEY, JSON.stringify(ids.slice(-VIDEO_EXCLUDE_MAX)))
  } catch {
    // quota / private mode
  }
}

function readSavedCursor() {
  try {
    const id = localStorage.getItem(SAVED_CURSOR_KEY)
    return id && id.length > 0 ? id : null
  } catch {
    return null
  }
}

function writeSavedCursor(id: string | null | undefined) {
  try {
    if (!id) {
      localStorage.removeItem(SAVED_CURSOR_KEY)
      return
    }
    localStorage.setItem(SAVED_CURSOR_KEY, id)
  } catch {
    // ignore
  }
}

function findSavedIndex(items: VideoItem[], preferred?: string | null) {
  const id = preferred ?? readSavedCursor()
  if (id) {
    const at = items.findIndex((video) => video.id === id)
    if (at >= 0) return at
  }
  return 0
}

/** 按收藏 id 顺序定位（不依赖当前 feed list，避免切 tab 时还拿着推荐列表） */
function findSavedIndexByIds(
  ids: string[],
  available: Set<string>,
  preferred?: string | null,
  fallback = 0,
) {
  const id = preferred ?? readSavedCursor()
  if (!id) return Math.max(0, fallback)
  let index = 0
  for (const item of ids) {
    if (!available.has(item)) continue
    if (item === id) return index
    index += 1
  }
  return Math.max(0, fallback)
}

function mergeVideoPages(current: VideoItem[], incoming: VideoItem[], allowRepeat: boolean) {
  if (incoming.length === 0) return current
  if (allowRepeat) return [...current, ...incoming]
  const have = new Set(current.map((video) => video.id))
  const extra = incoming.filter((video) => !have.has(video.id))
  return extra.length === 0 ? current : [...current, ...extra]
}

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
    localStorage.removeItem(MOVIE_SAVED_KEY)
    localStorage.removeItem(MOVIE_LIKED_KEY)
    localStorage.removeItem("sk_pic_liked")
    localStorage.removeItem("sk_pic_saved")
    sessionStorage.removeItem("sk_pics_vip")
  } catch {
    // ignore
  }
}

function readLocalMovieSaved() {
  return readLocalIds(MOVIE_SAVED_KEY)
}

function readLocalMovieLiked() {
  return readLocalIds(MOVIE_LIKED_KEY)
}

async function pushMovieIds(kind: "saved" | "liked", ids: string[]) {
  try {
    localStorage.setItem(kind === "saved" ? MOVIE_SAVED_KEY : MOVIE_LIKED_KEY, JSON.stringify(ids))
  } catch {
    // ignore
  }
  const response = await fetch(kind === "saved" ? "/api/auth/movie-saved" : "/api/auth/movie-likes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kind === "saved" ? { savedMovieIds: ids } : { likedMovieIds: ids }),
  })
  const data = (await response.json()) as {
    savedMovieIds?: string[]
    likedMovieIds?: string[]
    counts?: Record<string, number>
    error?: string
  }
  noteAuthResponse(response)
  if (!response.ok) throw new Error(data.error || translate(detectLocale(), "feed.syncFailed"))
  return data
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
    if (noteAuthResponse(response)) return null
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
  const t = useT()
  const { locale, setLocale } = useLocale()
  const router = useRouter()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(0)
  const forYouIndex = useRef(0)
  const savedIndex = useRef(0)
  const savedRestoreRef = useRef(true)
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [movies, setMovies] = useState<MovieItem[]>([])
  const [playingMovie, setPlayingMovie] = useState<MovieItem | null>(null)
  const [movieSavedOpen, setMovieSavedOpen] = useState(false)
  /** 收藏专用目录，不并入推荐流，避免刷到一堆收藏 */
  const [savedCatalog, setSavedCatalog] = useState<VideoItem[]>([])
  const [mode, setMode] = useState<VideoFeedResponse["mode"] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [moviesError, setMoviesError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [moviesLoading, setMoviesLoading] = useState(false)
  const [moviesLoadingMore, setMoviesLoadingMore] = useState(false)
  const [moviesHasMore, setMoviesHasMore] = useState(true)
  const [tab, setTab] = useState<Tab>("forYou")
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [banner, setBanner] = useState(true)
  const [toast, setToast] = useState<{ text: string; id: number; ms: number } | null>(null)
  const [toastOn, setToastOn] = useState(false)
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [likedIds, setLikedIds] = useState<string[]>([])
  const [savedMovieIds, setSavedMovieIds] = useState<string[]>([])
  const [likedMovieIds, setLikedMovieIds] = useState<string[]>([])
  const movieSavedSeq = useRef(0)
  const movieLikedSeq = useRef(0)
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
  const [movieQuotaHit, setMovieQuotaHit] = useState(false)
  const [headerHidden, setHeaderHidden] = useState(false)
  const [limits, setLimits] = useState(DEFAULT_APP_SETTINGS)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loopOne, setLoopOne] = useState(true)
  const profileRef = useRef(false)
  const vipRef = useRef(false)
  const movieSavedRef = useRef(false)
  const playingMovieRef = useRef(false)
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
  const seenIdsRef = useRef<string[]>([])
  const hasMoreRef = useRef(true)
  const movieHasMoreRef = useRef(true)
  const loadingMoreRef = useRef(false)
  const movieLoadingMoreRef = useRef(false)
  const moviesBootedRef = useRef(false)
  const fetchedSavedRef = useRef(new Set<string>())
  profileRef.current = profileOpen || vipOpen || picsOpen || movieSavedOpen
  vipRef.current = vipOpen
  picsRef.current = picsOpen
  movieSavedRef.current = movieSavedOpen
  playingMovieRef.current = Boolean(playingMovie)
  vipUserRef.current = user?.vip === true
  tabRef.current = tab

  const pausedRef = useRef(paused)
  const mutedRef = useRef(muted)
  const userRef = useRef(user)
  userRef.current = user
  const kickedLock = useRef(false)

  useEffect(() => {
    activeRef.current = active
    if (tab === "forYou") forYouIndex.current = active
    if (tab === "saved") {
      savedIndex.current = active
      const id = listRef.current[active]?.id
      if (id) writeSavedCursor(id)
    }
    pausedRef.current = paused
    mutedRef.current = muted
    profileRef.current = profileOpen || vipOpen || picsOpen || movieSavedOpen
    vipRef.current = vipOpen
    picsRef.current = picsOpen
    movieSavedRef.current = movieSavedOpen
    vipUserRef.current = user?.vip === true
    tabRef.current = tab
  }, [active, paused, muted, profileOpen, vipOpen, picsOpen, movieSavedOpen, tab, user?.vip])

  useEffect(() => {
    if (picsOpen || movieSavedOpen) setPaused(true)
  }, [picsOpen, movieSavedOpen])

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
                ? [{ id: item.id, name: typeof item.name === "string" ? item.name : t("pics.title"), src: item.src }]
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
      const byId = new Map<string, VideoItem>()
      for (const video of videos) byId.set(video.id, video)
      for (const video of savedCatalog) byId.set(video.id, video)
      return savedIds.flatMap((id) => {
        const video = byId.get(id)
        return video ? [video] : []
      })
    }
    if (tab === "movies") return []
    if (user?.vip) return videos
    if (videos.length === 0) return []
    const ids = readFreePackIds()
    const byId = new Map(videos.map((video) => [video.id, video]))
    const packed = ids.flatMap((id) => {
      const video = byId.get(id)
      return video ? [video] : []
    })
    return packed.length > 0 ? packed : videos.slice(0, readClientSettings().freeDailyVideos)
  }, [tab, videos, savedCatalog, savedIds, user?.vip, limits.freeDailyVideos])
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
    let alive = true
    const controller = new AbortController()
    setLoading(true)
    void (async () => {
      try {
        // 刷新 / 关标签后仍保留本轮已滑过的，避免重复
        const stored = readVideoSeen()
        seenIdsRef.current = stored
        const exclude = stored.slice(0, VIDEO_EXCLUDE_MAX)

        const fetchFirst = async (ex: string[]) => {
          if (ex.length === 0) {
            return fetch(`/api/videos?limit=${VIDEO_PAGE_SIZE}`, { signal: controller.signal })
          }
          // exclude 可能很大，走 POST
          return fetch("/api/videos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ limit: VIDEO_PAGE_SIZE, exclude: ex }),
            signal: controller.signal,
          })
        }

        const [settings, firstResponse] = await Promise.all([
          fetchClientSettings(),
          fetchFirst(exclude),
        ])
        if (!alive) return
        setLimits({ ...settings })
        let data = (await firstResponse.json()) as VideosPageResponse
        if (!alive) return
        let page = applyCountFixes(shuffle(data.videos ?? []), countFixes.current)

        // 本地已记满一轮且库里抽空 → 开新一轮
        if (page.length === 0 && exclude.length > 0) {
          seenIdsRef.current = []
          writeVideoSeen([])
          const again = await fetchFirst([])
          if (!alive) return
          data = (await again.json()) as VideosPageResponse
          page = applyCountFixes(shuffle(data.videos ?? []), countFixes.current)
        }

        ensureFreePackIds(page.map((video) => video.id))
        hasMoreRef.current = data.hasMore !== false && page.length >= VIDEO_PAGE_SIZE
        setHasMore(hasMoreRef.current)
        setVideos(page)
        setMode(data.mode)
        setError(data.error ?? null)
        setLoading(false)
      } catch (reason: unknown) {
        if (!alive) return
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setError(t("feed.videosLoadFailed"))
        setLoading(false)
      }
    })()
    return () => {
      alive = false
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (tab !== "forYou" || !user?.vip) return
    if (!hasMoreRef.current || loadingMoreRef.current) return
    if (list.length === 0) return
    if (list.length - active > LOAD_MORE_REMAINING) return

    let alive = true
    loadingMoreRef.current = true
    setLoadingMore(true)
    void (async () => {
      try {
        const fetchPage = async (exclude: string[]) => {
          const response = await fetch("/api/videos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              limit: VIDEO_PAGE_SIZE,
              exclude: exclude.slice(0, VIDEO_EXCLUDE_MAX),
            }),
          })
          return (await response.json()) as VideosPageResponse
        }

        const exclude = seenIdsRef.current.slice(0, VIDEO_EXCLUDE_MAX)
        let data = await fetchPage(exclude)
        if (!alive) return
        let page = applyCountFixes(data.videos ?? [], countFixes.current)
        let allowRepeat = false

        // 本轮已看完整个库 → 清空 exclude，开新一轮（此后才允许重复）
        if (page.length === 0 && exclude.length > 0) {
          seenIdsRef.current = []
          writeVideoSeen([])
          allowRepeat = true
          data = await fetchPage([])
          if (!alive) return
          page = applyCountFixes(data.videos ?? [], countFixes.current)
        }

        if (page.length === 0) {
          hasMoreRef.current = false
          setHasMore(false)
          return
        }

        // 不把整页写入 exclude，只在滑到当前条时记录
        hasMoreRef.current = true
        setHasMore(true)
        setVideos((current) => mergeVideoPages(current, page, allowRepeat))
      } catch {
        if (!alive) return
        hasMoreRef.current = false
        setHasMore(false)
      } finally {
        loadingMoreRef.current = false
        if (alive) setLoadingMore(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [active, hasMore, list.length, tab, user?.vip])

  useEffect(() => {
    if (tab !== "movies") return
    if (moviesBootedRef.current) return
    let alive = true
    setMoviesLoading(true)
    setMoviesError(null)
    void (async () => {
      try {
        const response = await fetch(`/api/movies?limit=${MOVIE_PAGE_SIZE}&offset=0`)
        const data = (await response.json()) as MoviesPageResponse
        if (!alive) return
        const page = Array.isArray(data.movies) ? data.movies : []
        movieHasMoreRef.current = data.hasMore !== false && page.length >= MOVIE_PAGE_SIZE
        moviesBootedRef.current = true
        setMoviesHasMore(movieHasMoreRef.current)
        setMovies(page)
        if (!vipUserRef.current) ensureFreeMoviePackIds(page.map((movie) => movie.id))
        setMoviesError(page.length === 0 ? data.error ?? t("feed.noMovies") : null)
      } catch {
        if (!alive) return
        setMoviesError(t("feed.moviesLoadFailed"))
      } finally {
        if (alive) setMoviesLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [tab])

  function loadMoreMovies() {
    if (tabRef.current !== "movies") return
    if (!movieHasMoreRef.current || movieLoadingMoreRef.current) return
    movieLoadingMoreRef.current = true
    setMoviesLoadingMore(true)
    const offset = movies.length
    void (async () => {
      try {
        const response = await fetch("/api/movies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: MOVIE_PAGE_SIZE, offset }),
        })
        const data = (await response.json()) as MoviesPageResponse
        const page = Array.isArray(data.movies) ? data.movies : []
        if (page.length === 0) {
          movieHasMoreRef.current = false
          setMoviesHasMore(false)
          return
        }
        setMovies((current) => {
          const have = new Set(current.map((item) => item.id))
          const extra = page.filter((item) => !have.has(item.id))
          const next = extra.length > 0 ? [...current, ...extra] : current
          if (!vipUserRef.current) ensureFreeMoviePackIds(next.map((movie) => movie.id))
          return next
        })
        movieHasMoreRef.current = data.hasMore !== false && page.length >= MOVIE_PAGE_SIZE
        setMoviesHasMore(movieHasMoreRef.current)
      } catch {
        movieHasMoreRef.current = false
        setMoviesHasMore(false)
      } finally {
        movieLoadingMoreRef.current = false
        setMoviesLoadingMore(false)
      }
    })()
  }

  useEffect(() => {
    if (tab !== "forYou") return
    const id = list[active]?.id
    if (!id) return
    const next = rememberSeen(seenIdsRef.current, [id])
    seenIdsRef.current = next
    writeVideoSeen(next)
  }, [tab, active, list])

  useEffect(() => {
    if (tab === "movies") {
      setPaused(true)
      applyHeaderHidden(false)
    }
  }, [tab])

  useEffect(() => {
    if (!user?.vip || savedIds.length === 0) return
    const have = new Set([
      ...videos.map((video) => video.id),
      ...savedCatalog.map((video) => video.id),
    ])
    const missing = savedIds.filter((id) => !have.has(id) && !fetchedSavedRef.current.has(id))
    if (missing.length === 0) return

    const batch = missing.slice(0, VIDEO_EXCLUDE_MAX)
    for (const id of batch) fetchedSavedRef.current.add(id)

    let alive = true
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch("/api/videos/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: batch }),
          signal: controller.signal,
        })
        if (!alive) return
        const data = (await response.json()) as { videos?: VideoItem[] }
        if (!alive) return
        const found = applyCountFixes(data.videos ?? [], countFixes.current)
        if (found.length === 0) return
        setSavedCatalog((current) => {
          const map = new Map(current.map((video) => [video.id, video]))
          for (const video of found) map.set(video.id, video)
          return [...map.values()]
        })
      } catch (reason: unknown) {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        for (const id of batch) fetchedSavedRef.current.delete(id)
      }
    })()
    return () => {
      alive = false
      controller.abort()
    }
  }, [savedIds, user?.vip, videos, savedCatalog])

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
    const localMovieSaved = readLocalMovieSaved()
    const localMovieLiked = readLocalMovieLiked()
    if (local.length > 0) setSavedIds(local)
    if (localLiked.length > 0) setLikedIds(localLiked)
    if (localMovieSaved.length > 0) setSavedMovieIds(localMovieSaved)
    if (localMovieLiked.length > 0) setLikedMovieIds(localMovieLiked)
    const controller = new AbortController()
    fetch("/api/auth/me", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as {
          username?: string | null
          vip?: boolean
          vipUntil?: string | null
          inviteCode?: string | null
          inviteCount?: number
          inviteVipCount?: number
          inviteNeed?: number
          freeDailyVideos?: number
          freeDailyPics?: number
          freeDailyMovies?: number
          savedIds?: string[]
          likedIds?: string[]
          savedMovieIds?: string[]
          likedMovieIds?: string[]
          kicked?: boolean
        }
        noteAuthResponse(response, data)
        return data
      })
      .then((data) => {
        const latestLocal = readLocalSaved()
        const latestLiked = readLocalLiked()
        const latestMovieSaved = readLocalMovieSaved()
        const latestMovieLiked = readLocalMovieLiked()
        const settings = applyClientSettings({
          freeDailyVideos: data.freeDailyVideos,
          freeDailyPics: data.freeDailyPics,
          freeDailyMovies: data.freeDailyMovies,
          inviteNeed: data.inviteNeed,
        })
        setLimits({ ...settings })
        if (!data.username) {
          setUser(null)
          setAuthReady(true)
          clearLocalAuthData()
          setSavedIds([])
          setLikedIds([])
          setSavedMovieIds([])
          setLikedMovieIds([])
          setSavedCatalog([])
          fetchedSavedRef.current.clear()
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
                paintFeedCounts("bookmarks", counts)
              })
            } else localStorage.setItem(SAVED_KEY, JSON.stringify(merged))
            return merged
          })
        } else {
          setSavedIds([])
          setSavedCatalog([])
          fetchedSavedRef.current.clear()
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
              paintFeedCounts("likes", counts)
            })
          } else localStorage.setItem(LIKED_KEY, JSON.stringify(merged))
          return merged
        })
        const remoteMovieSaved = Array.isArray(data.savedMovieIds)
          ? data.savedMovieIds.filter((id) => typeof id === "string")
          : []
        const remoteMovieLiked = Array.isArray(data.likedMovieIds)
          ? data.likedMovieIds.filter((id) => typeof id === "string")
          : []
        if (data.vip === true) {
          setSavedMovieIds((current) => {
            const merged = mergeIds(remoteMovieSaved, mergeIds(latestMovieSaved, current))
            if (!sameIds(merged, remoteMovieSaved)) {
              void pushMovieIds("saved", merged).then((payload) => {
                paintMovieCounts("bookmarks", payload.counts)
              })
            } else {
              try {
                localStorage.setItem(MOVIE_SAVED_KEY, JSON.stringify(merged))
              } catch {
                // ignore
              }
            }
            return merged
          })
        } else {
          setSavedMovieIds([])
          try {
            localStorage.removeItem(MOVIE_SAVED_KEY)
          } catch {
            // ignore
          }
        }
        setLikedMovieIds((current) => {
          const merged = mergeIds(remoteMovieLiked, mergeIds(latestMovieLiked, current))
          if (!sameIds(merged, remoteMovieLiked)) {
            void pushMovieIds("liked", merged).then((payload) => {
              paintMovieCounts("likes", payload.counts)
            })
          } else {
            try {
              localStorage.setItem(MOVIE_LIKED_KEY, JSON.stringify(merged))
            } catch {
              // ignore
            }
          }
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
  }, [list.length, active, tab])

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
        else if (movieSavedRef.current) setMovieSavedOpen(false)
        else setProfileOpen(false)
        return
      }
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      // 美图 / 电影收藏 / 电影播放打开时由弹层处理，其它快捷键先让出
      if (picsRef.current || movieSavedRef.current || playingMovieRef.current) return
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
          showToast(
            delta > 0
              ? translate(detectLocale(), "feed.atEnd")
              : translate(detectLocale(), "feed.atStart"),
          )
          return
        }
        element.currentTime = next
        showToast(
          `${delta > 0 ? translate(detectLocale(), "feed.seekForward") : translate(detectLocale(), "feed.seekBack")} ${formatClock(next)}`,
        )
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
    root.style.overflowY = profileOpen || vipOpen || picsOpen || movieSavedOpen ? "hidden" : "auto"
  }, [profileOpen, vipOpen, picsOpen, movieSavedOpen])

  useLayoutEffect(() => {
    if (!toast) return
    setToastOn(false)
  }, [toast])

  useEffect(() => {
    if (!toast) return
    const hold = Math.max(600, toast.ms)
    const enter = window.requestAnimationFrame(() => setToastOn(true))
    const fade = window.setTimeout(() => setToastOn(false), hold)
    const clear = window.setTimeout(() => setToast(null), hold + 180)
    return () => {
      window.cancelAnimationFrame(enter)
      window.clearTimeout(fade)
      window.clearTimeout(clear)
    }
  }, [toast])

  function showToast(text: string, ms = 700) {
    setToast({ text, id: Date.now(), ms })
  }

  function handleSessionKicked() {
    if (kickedLock.current) return
    if (!userRef.current) return
    kickedLock.current = true
    clearLocalAuthData()
    setSavedIds([])
    setLikedIds([])
    setSavedMovieIds([])
    setLikedMovieIds([])
    setSavedCatalog([])
    fetchedSavedRef.current.clear()
    setUser(null)
    setProfileOpen(false)
    setVipOpen(false)
    if (tabRef.current === "saved") {
      activeRef.current = forYouIndex.current
      setTab("forYou")
      setActive(forYouIndex.current)
    }
    showToast(translate(detectLocale(), "feed.kicked"), 2400)
    window.setTimeout(() => {
      kickedLock.current = false
    }, 2500)
  }

  useEffect(() => {
    function onKicked() {
      handleSessionKicked()
    }
    window.addEventListener(SESSION_KICKED_EVENT, onKicked)
    return () => window.removeEventListener(SESSION_KICKED_EVENT, onKicked)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable kick handler
  }, [])

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOOP_KEY)
      if (raw === "0") setLoopOne(false)
      else if (raw === "1") setLoopOne(true)
    } catch {
      // ignore
    }
  }, [])

  function toggleLoopOne() {
    setLoopOne((current) => {
      const next = !current
      try {
        localStorage.setItem(LOOP_KEY, next ? "1" : "0")
      } catch {
        // ignore
      }
      showToast(next ? t("feed.loopOne") : t("feed.loopNext"))
      return next
    })
  }

  function goNextOnEnded() {
    const root = scrollerRef.current
    if (!root || listRef.current.length === 0 || root.clientHeight === 0) return
    const current = activeRef.current
    const next = Math.min(listRef.current.length - 1, current + 1)
    if (next === current) return
    if (!allowIndex(next)) {
      setVipOpen(true)
      return
    }
    applyHeaderHidden(true)
    setPaused(false)
    root.scrollTo({ top: next * root.clientHeight, behavior: "smooth" })
  }

  function changeCount(id: string, field: "likes" | "bookmarks", delta: number) {
    const patch = (current: VideoItem[]) =>
      current.map((video) => {
        if (video.id !== id) return video
        const value = Math.max(0, video[field] + delta)
        countFixes.current[field][id] = value
        return { ...video, [field]: value }
      })
    setVideos(patch)
    setSavedCatalog(patch)
  }

  function paintFeedCounts(field: "likes" | "bookmarks", counts: Record<string, number> | null | undefined) {
    paintCounts(setVideos, field, counts)
    paintCounts(setSavedCatalog, field, counts)
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
        paintFeedCounts("bookmarks", counts)
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
        paintFeedCounts("likes", counts)
        return
      }
      if (user) changeCount(id, "likes", adding ? -1 : 1)
    })
  }

  function paintMovieCounts(field: "likes" | "bookmarks", counts: Record<string, number> | null | undefined) {
    if (!counts) return
    const paint = (movie: MovieItem) => {
      const next = counts[movie.id]
      if (typeof next !== "number") return movie
      return field === "likes" ? { ...movie, likes: next } : { ...movie, bookmarks: next }
    }
    setMovies((current) => current.map(paint))
    setPlayingMovie((current) => (current ? paint(current) : current))
  }

  function bumpMovieCount(id: string, field: "likes" | "bookmarks", delta: 1 | -1) {
    const apply = (movie: MovieItem) => {
      if (movie.id !== id) return movie
      const value = Math.max(0, (field === "likes" ? movie.likes : movie.bookmarks) + delta)
      return field === "likes" ? { ...movie, likes: value } : { ...movie, bookmarks: value }
    }
    setMovies((current) => current.map(apply))
    setPlayingMovie((current) => (current ? apply(current) : current))
  }

  function toggleMovieLike(id: string) {
    if (authReady && !user) {
      setProfileOpen(true)
      return
    }
    const adding = !likedMovieIds.includes(id)
    const next = adding ? [...likedMovieIds, id] : likedMovieIds.filter((item) => item !== id)
    const seq = ++movieLikedSeq.current
    setLikedMovieIds(next)
    bumpMovieCount(id, "likes", adding ? 1 : -1)
    void pushMovieIds("liked", next)
      .then((payload) => {
        if (seq !== movieLikedSeq.current) return
        if (payload.counts) paintMovieCounts("likes", payload.counts)
        else if (Array.isArray(payload.likedMovieIds)) setLikedMovieIds(payload.likedMovieIds)
      })
      .catch(() => {
        if (seq !== movieLikedSeq.current) return
        setLikedMovieIds((current) =>
          adding ? current.filter((item) => item !== id) : [...current, id],
        )
        bumpMovieCount(id, "likes", adding ? -1 : 1)
      })
  }

  function toggleMovieSaved(id: string) {
    if (authReady && !user) {
      setProfileOpen(true)
      return
    }
    if (authReady && user && !user.vip) {
      setVipOpen(true)
      return
    }
    const adding = !savedMovieIds.includes(id)
    const next = adding ? [id, ...savedMovieIds.filter((item) => item !== id)] : savedMovieIds.filter((item) => item !== id)
    const seq = ++movieSavedSeq.current
    setSavedMovieIds(next)
    bumpMovieCount(id, "bookmarks", adding ? 1 : -1)
    void pushMovieIds("saved", next)
      .then((payload) => {
        if (seq !== movieSavedSeq.current) return
        if (payload.counts) paintMovieCounts("bookmarks", payload.counts)
        else if (Array.isArray(payload.savedMovieIds)) setSavedMovieIds(payload.savedMovieIds)
      })
      .catch(() => {
        if (seq !== movieSavedSeq.current) return
        setSavedMovieIds((current) =>
          adding ? current.filter((item) => item !== id) : [id, ...current.filter((item) => item !== id)],
        )
        bumpMovieCount(id, "bookmarks", adding ? -1 : 1)
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
      setSavedMovieIds([])
      setLikedMovieIds([])
      setSavedCatalog([])
      fetchedSavedRef.current.clear()
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
      .then(async (response) => {
        const data = (await response.json()) as {
          vip?: boolean
          vipUntil?: string | null
          inviteCode?: string | null
          inviteCount?: number
          inviteVipCount?: number
          inviteNeed?: number
          savedIds?: string[]
          likedIds?: string[]
          savedMovieIds?: string[]
          likedMovieIds?: string[]
          kicked?: boolean
          username?: string | null
        }
        noteAuthResponse(response, data)
        return data
      })
      .then((data) => {
        const remote = Array.isArray(data.savedIds) ? data.savedIds.filter((id) => typeof id === "string") : []
        const remoteLiked = Array.isArray(data.likedIds) ? data.likedIds.filter((id) => typeof id === "string") : []
        const remoteMovieSaved = Array.isArray(data.savedMovieIds)
          ? data.savedMovieIds.filter((id) => typeof id === "string")
          : []
        const remoteMovieLiked = Array.isArray(data.likedMovieIds)
          ? data.likedMovieIds.filter((id) => typeof id === "string")
          : []
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
                paintFeedCounts("bookmarks", counts)
              })
            } else localStorage.setItem(SAVED_KEY, JSON.stringify(merged))
            return merged
          })
          setSavedMovieIds((current) => {
            const merged = mergeIds(remoteMovieSaved, current)
            if (!sameIds(merged, remoteMovieSaved)) {
              void pushMovieIds("saved", merged).then((payload) => paintMovieCounts("bookmarks", payload.counts))
            } else {
              try {
                localStorage.setItem(MOVIE_SAVED_KEY, JSON.stringify(merged))
              } catch {
                // ignore
              }
            }
            return merged
          })
        } else {
          setSavedIds([])
          setSavedMovieIds([])
          setSavedCatalog([])
          fetchedSavedRef.current.clear()
          try {
            localStorage.removeItem(SAVED_KEY)
            localStorage.removeItem(MOVIE_SAVED_KEY)
          } catch {
            // ignore
          }
        }
        setLikedIds((current) => {
          const merged = mergeIds(remoteLiked, current)
          if (!sameIds(merged, remoteLiked)) {
            void pushIds("liked", merged).then((counts) => {
              rememberCounts(countFixes.current, "likes", counts)
              paintFeedCounts("likes", counts)
            })
          } else localStorage.setItem(LIKED_KEY, JSON.stringify(merged))
          return merged
        })
        setLikedMovieIds((current) => {
          const merged = mergeIds(remoteMovieLiked, current)
          if (!sameIds(merged, remoteMovieLiked)) {
            void pushMovieIds("liked", merged).then((payload) => paintMovieCounts("likes", payload.counts))
          } else {
            try {
              localStorage.setItem(MOVIE_LIKED_KEY, JSON.stringify(merged))
            } catch {
              // ignore
            }
          }
          return merged
        })
      })
      .catch(() => {})
  }

  function openMovie(movie: MovieItem) {
    const vip = user?.vip === true
    if (!vip) {
      ensureFreeMoviePackIds([movie.id, ...movies.map((item) => item.id)])
    }
    if (!canWatchMovie(movie.id, vip)) {
      setPlayingMovie(null)
      setMovieQuotaHit(true)
      setVipOpen(true)
      return
    }
    if (!vip) noteWatchedMovieId(movie.id)
    setMovieQuotaHit(false)
    setPlayingMovie(movie)
  }

  function goVip() {
    setVipOpen(false)
    setMovieQuotaHit(false)
    setProfileOpen(false)
    setPicsOpen(false)
    router.push("/vip")
  }

  function selectTab(next: Tab) {
    if (next === tab) return
    if (tab === "forYou") forYouIndex.current = activeRef.current
    else if (tab === "saved") {
      savedIndex.current = activeRef.current
      const id = listRef.current[activeRef.current]?.id
      if (id) writeSavedCursor(id)
    }
    if (tab === "movies" || next === "movies") {
      setPlayingMovie(null)
      setMovieSavedOpen(false)
    }

    let index = activeRef.current
    if (next === "forYou") {
      index = forYouIndex.current
      setPaused(false)
    } else if (next === "movies") {
      setPaused(true)
    } else {
      savedRestoreRef.current = true
      const available = new Set<string>([
        ...videos.map((video) => video.id),
        ...savedCatalog.map((video) => video.id),
      ])
      index = findSavedIndexByIds(savedIds, available, readSavedCursor(), savedIndex.current)
      savedIndex.current = index
      setPaused(false)
    }
    activeRef.current = index
    applyHeaderHidden(false)
    setTab(next)
    setActive(index)
  }

  useLayoutEffect(() => {
    if (tab === "movies") return
    const root = scrollerRef.current
    if (!root || root.clientHeight === 0) return
    // 虚拟窗口只有附近几条 DOM，不能用 [data-index] 数量夹索引
    const max = Math.max(0, listRef.current.length - 1)
    const remembered = tab === "forYou" ? forYouIndex.current : savedIndex.current
    const index = Math.min(remembered, max)
    activeRef.current = index
    root.scrollTop = index * root.clientHeight
  }, [tab])

  useEffect(() => {
    if (tab !== "saved" || list.length === 0) return
    if (savedRestoreRef.current) {
      const cursor = readSavedCursor()
      const index = findSavedIndex(list, cursor)
      // 目标还没进 catalog 时先等 lookup
      if (cursor && list[index]?.id !== cursor) return
      savedRestoreRef.current = false
      if (index !== activeRef.current) {
        activeRef.current = index
        savedIndex.current = index
        setActive(index)
      }
      const root = scrollerRef.current
      if (root && root.clientHeight > 0) root.scrollTo({ top: index * root.clientHeight })
      return
    }
    if (activeRef.current < list.length) return
    const index = list.length - 1
    const root = scrollerRef.current
    activeRef.current = index
    savedIndex.current = index
    setActive(index)
    if (root && root.clientHeight > 0) root.scrollTo({ top: index * root.clientHeight })
  }, [list, tab])

  function jumpSavedToFirst() {
    if (tab !== "saved" || list.length === 0) return
    const first = list[0]
    if (!first) return
    activeRef.current = 0
    savedIndex.current = 0
    writeSavedCursor(first.id)
    setActive(0)
    applyHeaderHidden(false)
    setPaused(false)
    const root = scrollerRef.current
    if (root && root.clientHeight > 0) root.scrollTo({ top: 0 })
  }

  useEffect(() => {
    const onChange = () => setFullscreen(isFullscreenFor(stageRef.current))
    onChange()
    return subscribeFullscreenChange(stageRef.current, onChange)
  }, [])

  function toggleFullscreen() {
    const stage = stageRef.current
    if (!stage) return
    if (isFullscreenFor(stage)) {
      void exitFullscreen(stage)
      return
    }
    void requestFullscreen(stage).catch(() => {})
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
  const topBarHidden = playingMovie || (tab === "movies" ? headerHidden : chromeHidden)
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-[#1a1020] text-white">
      <div
        ref={stageRef}
        className="stage relative h-dvh w-full overflow-hidden sm:h-[min(100dvh,860px)] sm:w-[400px] sm:rounded-[28px] sm:ring-1 sm:ring-white/10"
      >
        <div
          ref={scrollerRef}
          className={`feed-scroller${tab === "movies" ? " pointer-events-none invisible" : ""}`}
          aria-hidden={tab === "movies"}
        >
          {tab === "movies" ? null : loading ? (
            <div className="feed-slide grid place-items-center">
              <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            </div>
          ) : error && videos.length === 0 ? (
            <div className="feed-slide grid place-items-center px-8 text-center">
              <div>
                <p className="text-lg font-medium">{t("feed.loadFailed")}</p>
                <p className="mt-2 text-sm leading-6 text-white/60">{error}</p>
              </div>
            </div>
          ) : tab === "saved" && authReady && !user?.vip ? (
            <div className="feed-slide grid place-items-center px-8 text-center">
              <div>
                <p className="text-lg font-medium">{t("feed.savedVipOnly")}</p>
                <button
                  type="button"
                  className="mt-4 rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] px-4 py-1.5 text-sm font-semibold text-white"
                  onClick={() => (user ? goVip() : setProfileOpen(true))}
                >
                  {user ? t("feed.openVip") : t("feed.goLogin")}
                </button>
              </div>
            </div>
          ) : list.length === 0 && tab === "saved" && user?.vip && savedIds.length > 0 ? (
            <div className="feed-slide grid place-items-center">
              <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            </div>
          ) : list.length === 0 ? (
            <div className="feed-slide grid place-items-center px-8 text-center">
              <div>
                <p className="text-lg font-medium">{t("feed.noSaved")}</p>
                <button
                  type="button"
                  className="mt-4 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black"
                  onClick={() => selectTab("forYou")}
                >
                  {t("feed.goForYou")}
                </button>
              </div>
            </div>
          ) : (
            (() => {
              // 只挂载附近几条，避免整表上千个 DOM + 多路 HLS 越刷越卡
              const windowSize = 2
              const from = Math.max(0, active - windowSize)
              const to = Math.min(list.length - 1, active + windowSize)
              const before = from
              const after = list.length - 1 - to
              return (
                <>
                  {before > 0 ? (
                    <div
                      aria-hidden
                      className="pointer-events-none shrink-0"
                      style={{ height: `calc(${before} * var(--slide-h, 100%))` }}
                    />
                  ) : null}
                  {list.slice(from, to + 1).map((video, offset) => {
                    const index = from + offset
                    return (
                      <VideoSlide
                        key={`${video.id}-${index}`}
                        video={video}
                        index={index}
                        active={index === active}
                        preload={Math.abs(index - active) <= 1}
                        muted={muted}
                        paused={paused || watchBlocked || limitBlocked}
                        saved={savedIds.includes(video.id)}
                        liked={likedIds.includes(video.id)}
                        loopOne={loopOne}
                        chromeHidden={chromeHidden}
                        onPausedChange={setPlayback}
                        onToggleSaved={() => toggleSaved(video.id)}
                        onToggleLike={() => toggleLike(video.id)}
                        onToggleLoop={toggleLoopOne}
                        onEnded={goNextOnEnded}
                      />
                    )
                  })}
                  {after > 0 ? (
                    <div
                      aria-hidden
                      className="pointer-events-none shrink-0"
                      style={{ height: `calc(${after} * var(--slide-h, 100%))` }}
                    />
                  ) : null}
                </>
              )
            })()
          )}
        </div>

        {tab === "movies" ? (
          <div
            className={`absolute inset-0 z-20 ${playingMovie ? "invisible pointer-events-none" : ""}`}
            aria-hidden={Boolean(playingMovie)}
            inert={playingMovie ? true : undefined}
          >
            <MovieList
              movies={movies}
              loading={moviesLoading}
              loadingMore={moviesLoadingMore}
              error={moviesError}
              hasMore={moviesHasMore}
              vip={user?.vip === true}
              onOpen={openMovie}
              onLoadMore={loadMoreMovies}
              likedIds={likedMovieIds}
              savedIds={savedMovieIds}
              onToggleLike={toggleMovieLike}
              onToggleSaved={toggleMovieSaved}
              onHeaderHidden={applyHeaderHidden}
            />
          </div>
        ) : null}

        {playingMovie ? (
          <MoviePlayer
            movie={playingMovie}
            liked={likedMovieIds.includes(playingMovie.id)}
            saved={savedMovieIds.includes(playingMovie.id)}
            onClose={() => setPlayingMovie(null)}
            onToggleLike={() => toggleMovieLike(playingMovie.id)}
            onToggleSaved={() => toggleMovieSaved(playingMovie.id)}
          />
        ) : null}

        <header
          className="feed-header pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-3 pt-[max(10px,env(safe-area-inset-top))]"
          data-hidden={topBarHidden ? "true" : "false"}
          style={{
            opacity: topBarHidden ? 0 : 1,
            transform: topBarHidden ? "translate3d(0, -110%, 0)" : "translate3d(0, 0, 0)",
          }}
        >
          <button
            type="button"
            className="pointer-events-auto relative mt-0.5 flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/25"
            aria-label={t("nav.pics")}
            onClick={() => setPicsOpen(true)}
          >
            {picThumb ? (
              <img src={picThumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center bg-gradient-to-br from-[#fe2c55]/80 to-[#25f4ee]/70 text-[10px] font-semibold tracking-wide">
                {t("nav.pics")}
              </span>
            )}
            {picThumb && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/45 py-px text-center text-[9px] font-semibold leading-none text-white/95">
                {t("nav.pics")}
              </span>
            )}
          </button>
          <nav className="pointer-events-auto flex items-center gap-5 pt-1 text-[17px] font-semibold">
            <TabButton active={tab === "movies"} onClick={() => selectTab("movies")}>
              {t("tab.movies")}
            </TabButton>
            <TabButton
              active={tab === "saved"}
              badge={user?.vip && savedIds.length > 0 ? formatCount(savedIds.length) : undefined}
              onClick={() => selectTab("saved")}
            >
              {t("tab.saved")}
            </TabButton>
            <TabButton active={tab === "forYou"} onClick={() => selectTab("forYou")}>
              {t("tab.forYou")}
            </TabButton>
          </nav>
          <div className="flex items-center">
            {tab !== "movies" ? (
              <>
                <button
                  type="button"
                  className="pointer-events-auto hidden h-10 w-10 place-items-center sm:grid"
                  aria-label={fullscreen ? t("nav.exitFullscreen") : t("nav.fullscreen")}
                  onClick={toggleFullscreen}
                >
                  <IconFullscreen active={fullscreen} />
                </button>
                <button
                  type="button"
                  className="pointer-events-auto grid h-10 w-10 place-items-center"
                  aria-label={muted ? t("nav.unmute") : t("nav.mute")}
                  onClick={toggleMute}
                >
                  <IconVolume muted={muted} />
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="pointer-events-auto grid h-10 w-10 place-items-center"
              aria-label={locale === "zh" ? t("account.langEn") : t("account.langZh")}
              title={t("account.language")}
              onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            >
              <IconLang className="h-5 w-5" />
            </button>
          </div>
        </header>

        {!loading && tab === "saved" && user?.vip && list.length > 0 && (
          <div
            className="feed-profile pointer-events-none absolute left-4 bottom-[max(22px,env(safe-area-inset-bottom))] z-30 flex items-center gap-2 pb-1"
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
            {active > 0 ? (
              <button
                type="button"
                className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-black/35 ring-1 ring-white/25 backdrop-blur-sm"
                aria-label={t("nav.backToFirst")}
                onClick={jumpSavedToFirst}
              >
                <IconToFirst />
              </button>
            ) : null}
          </div>
        )}

        {!loading && !playingMovie && (
          <div
            className="feed-profile absolute right-4 bottom-[max(18px,env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-3 pb-1"
            data-hidden={topBarHidden ? "true" : "false"}
            style={{
              opacity: topBarHidden ? 0 : 1,
              transform: topBarHidden ? "translate3d(120%, 0, 0)" : "translate3d(0, 0, 0)",
            }}
          >
            {tab === "movies" ? (
              <button
                type="button"
                aria-label={t("nav.movieSaved")}
                className="grid h-11 w-11 place-items-center rounded-full bg-black/45 ring-1 ring-white/25 backdrop-blur-md"
                onClick={() => setMovieSavedOpen(true)}
              >
                <IconBookmark filled={savedMovieIds.length > 0} className="h-5 w-5" />
              </button>
            ) : null}
            <button
              type="button"
              aria-label={t("nav.profile")}
              className="grid place-items-center"
              onClick={() => setProfileOpen(true)}
            >
              <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 border-white/80 bg-gradient-to-br from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-base font-semibold text-white">
                {user?.username ? Array.from(user.username)[0] : <IconUser />}
              </span>
            </button>
          </div>
        )}

        {showBanner && (
          <div className="absolute inset-x-3 top-14 z-30 flex items-start gap-3 rounded-2xl bg-black/60 px-3 py-2 text-[12px] leading-5 text-white/90 backdrop-blur-md">
            <p className="flex-1">{t("feed.demoBanner")}</p>
            <button
              type="button"
              className="shrink-0 text-white/70"
              onClick={() => setBanner(false)}
            >
              {t("feed.dismiss")}
            </button>
          </div>
        )}

        {muted && !showBanner && !loading && list.length > 0 && (
          <button
            type="button"
            className="absolute left-1/2 top-[4.5rem] z-30 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs backdrop-blur"
            onClick={toggleMute}
          >
            {t("feed.tapUnmute")}
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
        <MovieSavedSheet
          open={movieSavedOpen}
          savedIds={savedMovieIds}
          likedIds={likedMovieIds}
          knownMovies={playingMovie ? [playingMovie, ...movies] : movies}
          onClose={() => setMovieSavedOpen(false)}
          onOpen={openMovie}
          onToggleLike={toggleMovieLike}
          onToggleSaved={toggleMovieSaved}
        />
        <div inert={!vipOpen} className={`absolute inset-0 z-40 ${vipOpen ? "" : "pointer-events-none"}`}>
          <button
            type="button"
            aria-label={t("vipSheet.close")}
            className={`absolute inset-0 bg-black/45 transition-opacity ${vipOpen ? "opacity-100" : "opacity-0"}`}
            onClick={() => {
              setVipOpen(false)
              setMovieQuotaHit(false)
            }}
          />
          <section
            className={`absolute inset-x-0 bottom-0 rounded-t-2xl bg-[#161018] px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] text-white shadow-2xl transition-transform duration-300 ${
              vipOpen ? "translate-y-0" : "translate-y-full"
            }`}
            aria-hidden={!vipOpen}
          >
            <h2 className="text-center text-base font-semibold">{t("vipSheet.title")}</h2>
            {movieQuotaHit ? (
              <p className="mt-2 text-center text-sm text-[#ff8aa3]">
                {t("vipSheet.freeMoviesUsed", {
                  n: limits.freeDailyMovies,
                  watched: Math.min(limits.freeDailyMovies, watchedMovieCountToday()),
                })}
              </p>
            ) : watchBlocked ? (
              <p className="mt-2 text-center text-sm text-[#ff8aa3]">
                {t("vipSheet.freeUsed", {
                  n: limits.freeDailyVideos,
                  watched: Math.min(limits.freeDailyVideos, watchedCountToday()),
                })}
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2 text-left text-[13px]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                <p className="text-[12px] text-white/40">{t("vipSheet.freeUser")}</p>
                <ul className="mt-2 space-y-1.5 text-white/65">
                  <li>{t("vipSheet.freeVideos", { n: limits.freeDailyVideos })}</li>
                  <li>{t("vipSheet.freeMovies", { n: limits.freeDailyMovies })}</li>
                  <li>{t("vipSheet.noSave")}</li>
                  <li>{t("vipSheet.freePics", { n: limits.freeDailyPics })}</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-[#25f4ee]/25 bg-[linear-gradient(160deg,rgba(254,44,85,0.14),rgba(37,244,238,0.1))] px-3 py-3">
                <p className="text-[12px] font-semibold text-[#25f4ee]">{t("vipSheet.vipUser")}</p>
                <ul className="mt-2 space-y-1.5 text-white">
                  <li>{t("vipSheet.unlimitedWatch")}</li>
                  <li>{t("vipSheet.unlimitedMovies")}</li>
                  <li>{t("vipSheet.canSave")}</li>
                  <li>{t("vipSheet.unlimitedPics")}</li>
                </ul>
              </div>
            </div>
            <button
              type="button"
              className="mt-5 h-11 w-full rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-sm font-semibold text-white"
              onClick={goVip}
            >
              {t("vipSheet.cta")}
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
