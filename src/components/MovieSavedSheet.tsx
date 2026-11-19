"use client"

import { useEffect, useRef, useState } from "react"
import { IconBookmark, IconHeart, IconPlay } from "@/components/icons"
import { formatCount } from "@/lib/format"
import type { MovieItem, MoviesPageResponse } from "@/lib/movies"

export function MovieSavedSheet({
  open,
  savedIds,
  likedIds,
  knownMovies,
  onClose,
  onOpen,
  onToggleLike,
  onToggleSaved,
}: {
  open: boolean
  savedIds: string[]
  likedIds: string[]
  knownMovies: MovieItem[]
  onClose: () => void
  onOpen: (movie: MovieItem) => void
  onToggleLike: (id: string) => void
  onToggleSaved: (id: string) => void
}) {
  const [movies, setMovies] = useState<MovieItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const knownRef = useRef(knownMovies)
  knownRef.current = knownMovies
  const savedKey = savedIds.join("\0")

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    let alive = true
    const ids = savedKey ? savedKey.split("\0") : []

    if (ids.length === 0) {
      setMovies([])
      setError(null)
      setLoading(false)
      return
    }

    const known = new Map(knownRef.current.map((movie) => [movie.id, movie]))
    const cached = ids.map((id) => known.get(id)).filter((movie): movie is MovieItem => Boolean(movie))
    if (cached.length > 0) setMovies(cached)

    if (cached.length === ids.length) {
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const response = await fetch("/api/movies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        })
        const data = (await response.json()) as MoviesPageResponse
        if (!alive) return
        const page = Array.isArray(data.movies) ? data.movies : []
        if (data.error && page.length === 0) {
          setError(data.error)
          setMovies([])
          return
        }
        setMovies(page)
      } catch {
        if (!alive) return
        setError("收藏列表加载失败")
        setMovies([])
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [open, savedKey])

  useEffect(() => {
    if (!open) return
    const known = new Map(knownMovies.map((movie) => [movie.id, movie]))
    setMovies((current) => {
      const byId = new Map(current.map((movie) => [movie.id, movie]))
      for (const [id, movie] of known) byId.set(id, movie)
      return savedIds.map((id) => byId.get(id)).filter((movie): movie is MovieItem => Boolean(movie))
    })
  }, [open, savedIds, knownMovies])

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
        <header className="relative z-10 flex shrink-0 items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
          <button
            type="button"
            className="grid h-10 w-10 place-items-center text-xl text-white/80"
            onClick={onClose}
            aria-label="关闭收藏"
          >
            ×
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold tracking-wide">电影收藏</p>
            <p className="text-[11px] text-white/40">
              {movies.length > 0 ? `${movies.length} 部` : "还没有收藏"}
            </p>
          </div>
          <span className="w-10" />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(28px,env(safe-area-inset-bottom))]">
          <div className="mx-auto w-full max-w-[650px]">
            {loading && movies.length === 0 ? (
              <div className="grid min-h-[50dvh] place-items-center">
                <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              </div>
            ) : error && movies.length === 0 ? (
              <div className="grid min-h-[50dvh] place-items-center px-8 text-center">
                <div>
                  <p className="text-lg font-medium tracking-wide">加载失败</p>
                  <p className="mt-2 text-sm leading-6 text-white/55">{error}</p>
                </div>
              </div>
            ) : movies.length === 0 ? (
              <div className="grid min-h-[50dvh] place-items-center px-8 text-center">
                <p className="text-lg font-medium tracking-wide">还没有收藏电影</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5">
                {movies.map((movie, index) => (
                  <button
                    key={movie.id}
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
                        />
                      ) : (
                        <div className="grid min-h-48 w-full place-items-center bg-gradient-to-br from-[#2a1428] to-[#101820] text-sm text-white/35">
                          暂无封面
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-90" />
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
                          <span className="text-[11px] font-semibold text-white/80">
                            {formatCount(movie.likes)}
                          </span>
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
                          <span className="text-[11px] font-semibold text-white/80">
                            {formatCount(movie.bookmarks)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
