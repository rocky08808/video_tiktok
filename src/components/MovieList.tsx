"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { IconBookmark, IconHeart, IconPlay } from "@/components/icons"
import { useT } from "@/components/LocaleProvider"
import { formatCount } from "@/lib/format"
import type { MovieItem } from "@/lib/movies"

const MOVIE_DOM_WINDOW = 50
const ESTIMATE_ITEM_H = 460
const ITEM_GAP = 20

export function MovieList({
  movies,
  loading,
  loadingMore,
  error,
  hasMore,
  onOpen,
  onLoadMore,
  likedIds,
  savedIds,
  onToggleLike,
  onToggleSaved,
  onHeaderHidden,
}: {
  movies: MovieItem[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  onOpen: (movie: MovieItem) => void
  onLoadMore: () => void
  likedIds: string[]
  savedIds: string[]
  onToggleLike: (id: string) => void
  onToggleSaved: (id: string) => void
  onHeaderHidden?: (hidden: boolean) => void
}) {
  const t = useT()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const heightsRef = useRef<number[]>([])
  const itemsRef = useRef<Map<number, HTMLElement>>(new Map())
  const lastScrollY = useRef(0)
  const onHeaderHiddenRef = useRef(onHeaderHidden)
  const [range, setRange] = useState({ from: 0, to: 0 })
  const [layoutTick, setLayoutTick] = useState(0)
  onHeaderHiddenRef.current = onHeaderHidden

  const measureAllVisible = useCallback(() => {
    let changed = false
    itemsRef.current.forEach((node, index) => {
      const next = Math.round(node.getBoundingClientRect().height)
      if (next > 0 && heightsRef.current[index] !== next) {
        heightsRef.current[index] = next
        changed = true
      }
    })
    if (changed) setLayoutTick((value) => value + 1)
  }, [])

  const heightAt = useCallback((index: number) => {
    return heightsRef.current[index] || ESTIMATE_ITEM_H
  }, [])

  /** 第 index 条顶部相对列表起点的偏移（含间距） */
  const offsetOf = useCallback(
    (index: number) => {
      const safe = Math.max(0, Math.min(index, movies.length))
      let total = 0
      for (let i = 0; i < safe; i += 1) total += heightAt(i) + ITEM_GAP
      return total
    },
    [heightAt, movies.length],
  )

  const updateRange = useCallback(() => {
    const root = scrollerRef.current
    if (!root || movies.length === 0) {
      setRange({ from: 0, to: 0 })
      return
    }

    const scrollTop = Math.max(0, root.scrollTop)

    let acc = 0
    let start = 0
    for (let index = 0; index < movies.length; index += 1) {
      const span = heightAt(index) + ITEM_GAP
      if (acc + span > scrollTop) {
        start = index
        break
      }
      acc += span
      start = index
    }

    const half = Math.floor(MOVIE_DOM_WINDOW / 2)
    let from = Math.max(0, start - half)
    let to = Math.min(movies.length - 1, from + MOVIE_DOM_WINDOW - 1)
    from = Math.max(0, to - MOVIE_DOM_WINDOW + 1)

    setRange((current) => (current.from === from && current.to === to ? current : { from, to }))

    if (to >= movies.length - 8) onLoadMore()
  }, [heightAt, movies.length, onLoadMore])

  useEffect(() => {
    heightsRef.current = heightsRef.current.slice(0, movies.length)
    const to = Math.min(movies.length - 1, Math.max(MOVIE_DOM_WINDOW - 1, 0))
    setRange({ from: 0, to: Math.max(0, to) })
  }, [movies.length])

  useEffect(() => {
    updateRange()
  }, [updateRange, layoutTick, movies.length])

  useEffect(() => {
    const root = scrollerRef.current
    if (!root) return
    lastScrollY.current = root.scrollTop
    const onScroll = () => {
      updateRange()
      const y = root.scrollTop
      const prev = lastScrollY.current
      lastScrollY.current = y
      if (y <= 12) {
        onHeaderHiddenRef.current?.(false)
        return
      }
      if (y > prev + 6) onHeaderHiddenRef.current?.(true)
      else if (y < prev - 6) onHeaderHiddenRef.current?.(false)
    }
    root.addEventListener("scroll", onScroll, { passive: true })
    return () => root.removeEventListener("scroll", onScroll)
  }, [updateRange])

  useEffect(() => {
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            measureAllVisible()
          })
        : null
    itemsRef.current.forEach((node) => observer?.observe(node))
    return () => observer?.disconnect()
  }, [measureAllVisible, range.from, range.to, movies])

  const topSpacer = useMemo(() => offsetOf(range.from), [offsetOf, range.from, layoutTick])
  const bottomSpacer = useMemo(() => {
    if (range.to >= movies.length - 1) return 0
    return Math.max(0, offsetOf(movies.length) - offsetOf(range.to + 1))
  }, [offsetOf, range.to, movies.length, layoutTick])

  const visible = movies.slice(range.from, range.to + 1)

  function bindItem(index: number, node: HTMLButtonElement | null) {
    if (node) {
      itemsRef.current.set(index, node)
      const next = Math.round(node.getBoundingClientRect().height)
      if (next > 0 && heightsRef.current[index] !== next) {
        heightsRef.current[index] = next
        setLayoutTick((value) => value + 1)
      }
    } else {
      itemsRef.current.delete(index)
    }
  }

  if (loading && movies.length === 0) {
    return (
      <div className="movie-list-shell grid h-full place-items-center">
        <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
      </div>
    )
  }

  if (error && movies.length === 0) {
    return (
      <div className="movie-list-shell grid h-full place-items-center px-8 text-center">
        <div className="mx-auto w-full max-w-[650px]">
          <p className="text-lg font-medium tracking-wide">{t("movie.noMovies")}</p>
          <p className="mt-2 text-sm leading-6 text-white/55">{error}</p>
        </div>
      </div>
    )
  }

  if (movies.length === 0) {
    return (
      <div className="movie-list-shell grid h-full place-items-center px-8 text-center">
        <p className="mx-auto w-full max-w-[650px] text-lg font-medium tracking-wide">{t("movie.noMovies")}</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollerRef}
      className="movie-list-shell h-full overflow-y-auto overscroll-contain pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(68px,calc(env(safe-area-inset-top)+56px))]"
    >
      <div className="mx-auto w-full max-w-[650px] px-3">
        {topSpacer > 0 ? <div aria-hidden style={{ height: topSpacer }} /> : null}

        <div className="grid grid-cols-1" style={{ gap: ITEM_GAP }}>
          {visible.map((movie, offset) => {
            const index = range.from + offset
            return (
              <button
                key={movie.id}
                ref={(node) => bindItem(index, node)}
                type="button"
                className="group w-full text-left"
                onClick={() => onOpen(movie)}
              >
                <div className="relative overflow-hidden rounded-[18px] bg-[#1a1018] shadow-[0_18px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
                  {movie.img ? (
                    <img
                      src={movie.img}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="block h-auto w-full transition duration-500 ease-out group-active:scale-[1.02]"
                      loading="lazy"
                      onLoad={measureAllVisible}
                    />
                  ) : (
                    <div className="grid min-h-48 w-full place-items-center bg-gradient-to-br from-[#2a1428] to-[#101820] text-sm text-white/35">
                      {t("movie.noCover")}
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-90" />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(254,44,85,0.18),transparent_55%)] opacity-0 transition duration-300 group-active:opacity-100" />

                  <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white/85 backdrop-blur-sm ring-1 ring-white/15">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition duration-300 group-active:opacity-100">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-[#fe2c55]/90 pl-1 shadow-[0_8px_28px_rgba(254,44,85,0.45)] ring-1 ring-white/25">
                      <IconPlay className="h-7 w-7" />
                    </span>
                  </span>
                </div>

                <div className="mt-3 flex items-start gap-3 px-1">
                  <p className="min-w-0 flex-1 line-clamp-2 text-[16px] font-semibold leading-6 tracking-wide text-white text-shadow">
                    {movie.title}
                  </p>
                  <div className="flex shrink-0 items-center gap-2 pt-0.5">
                    <span
                      role="button"
                      tabIndex={0}
                      className="flex items-center gap-1 rounded-full bg-white/8 px-2 py-1 ring-1 ring-white/10"
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleLike(movie.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          event.stopPropagation()
                          onToggleLike(movie.id)
                        }
                      }}
                    >
                      <IconHeart filled={likedIds.includes(movie.id)} className="h-4 w-4" />
                      <span className="text-[11px] font-semibold text-white/80">{formatCount(movie.likes)}</span>
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="flex items-center gap-1 rounded-full bg-white/8 px-2 py-1 ring-1 ring-white/10"
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleSaved(movie.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          event.stopPropagation()
                          onToggleSaved(movie.id)
                        }
                      }}
                    >
                      <IconBookmark filled={savedIds.includes(movie.id)} className="h-4 w-4" />
                      <span className="text-[11px] font-semibold text-white/80">{formatCount(movie.bookmarks)}</span>
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {bottomSpacer > 0 ? <div aria-hidden style={{ height: bottomSpacer }} /> : null}

        <div className="flex h-14 items-center justify-center">
          {loadingMore ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          ) : hasMore ? (
            <span className="text-[11px] tracking-[0.18em] text-white/30">{t("movie.loadMore")}</span>
          ) : (
            <span className="text-[11px] tracking-[0.18em] text-white/30">{t("movie.end")}</span>
          )}
        </div>
      </div>
    </div>
  )
}
