"use client"

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { HlsVideo, type HlsSeekApi } from "@/components/HlsVideo"
import {
  IconBack,
  IconBookmark,
  IconFullscreen,
  IconHeart,
  IconPause,
  IconPlay,
  IconSeek,
  IconVolume,
} from "@/components/icons"
import { formatCount } from "@/lib/format"
import type { MovieItem } from "@/lib/movies"

export function MoviePlayer({
  movie,
  liked,
  saved,
  onClose,
  onToggleLike,
  onToggleSaved,
}: {
  movie: MovieItem
  liked: boolean
  saved: boolean
  onClose: () => void
  onToggleLike: () => void
  onToggleSaved: () => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const seekApiRef = useRef<HlsSeekApi | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const seekHintTimerRef = useRef<number | null>(null)
  const seekHintDeltaRef = useRef(0)
  const chromeHideTimerRef = useRef<number | null>(null)
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [progress, setProgress] = useState(0)
  const [scrub, setScrub] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [epoch, setEpoch] = useState(0)
  const [chromeHidden, setChromeHidden] = useState(false)
  /** 顶栏 + 点赞/收藏：隐藏后仅点击视频可再显示 */
  const [metaHidden, setMetaHidden] = useState(false)
  const [seekHint, setSeekHint] = useState<{ delta: number; key: number } | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  function clearChromeHideTimer() {
    if (chromeHideTimerRef.current != null) {
      window.clearTimeout(chromeHideTimerRef.current)
      chromeHideTimerRef.current = null
    }
  }

  function scheduleChromeHide() {
    clearChromeHideTimer()
    if (pausedRef.current || draggingRef.current) return
    chromeHideTimerRef.current = window.setTimeout(() => {
      chromeHideTimerRef.current = null
      if (pausedRef.current || draggingRef.current) return
      setChromeHidden(true)
      setMetaHidden(true)
    }, 5000)
  }

  /** 仅点击视频时唤出顶栏/点赞与底部控制 */
  function revealAllChrome() {
    setChromeHidden(false)
    setMetaHidden(false)
    scheduleChromeHide()
  }

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    setPaused(false)
    pausedRef.current = false
    setBuffering(true)
    setProgress(0)
    setScrub(null)
    setDragging(false)
    draggingRef.current = false
    setFailed(null)
    setChromeHidden(false)
    setMetaHidden(false)
    setSeekHint(null)
    seekHintDeltaRef.current = 0
    if (seekHintTimerRef.current != null) {
      window.clearTimeout(seekHintTimerRef.current)
      seekHintTimerRef.current = null
    }
    clearChromeHideTimer()
    setEpoch((value) => value + 1)
    scheduleChromeHide()
  }, [movie.id, movie.video])

  useEffect(() => {
    return () => {
      if (seekHintTimerRef.current != null) {
        window.clearTimeout(seekHintTimerRef.current)
      }
      clearChromeHideTimer()
    }
  }, [])

  useEffect(() => {
    if (paused || failed) {
      clearChromeHideTimer()
      setChromeHidden(false)
      setMetaHidden(false)
      return
    }
    scheduleChromeHide()
  }, [paused, failed])

  function ratioFromClientX(clientX: number) {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  function seekToRatio(ratio: number) {
    const next = Math.max(0, Math.min(1, ratio))
    setScrub(next)
    setProgress(next)
    seekApiRef.current?.seekRatio(next)
  }

  function showSeekHint(seconds: number) {
    const nextDelta =
      seekHintDeltaRef.current !== 0 && Math.sign(seekHintDeltaRef.current) === Math.sign(seconds)
        ? seekHintDeltaRef.current + seconds
        : seconds
    seekHintDeltaRef.current = nextDelta
    setSeekHint({ delta: nextDelta, key: Date.now() })
    if (seekHintTimerRef.current != null) window.clearTimeout(seekHintTimerRef.current)
    seekHintTimerRef.current = window.setTimeout(() => {
      setSeekHint(null)
      seekHintDeltaRef.current = 0
      seekHintTimerRef.current = null
    }, 900)
  }

  function seekBySeconds(seconds: number) {
    setScrub(null)
    setMetaHidden(true)
    seekApiRef.current?.seekBy(seconds)
    showSeekHint(seconds)
    scheduleChromeHide()
  }

  function onProgressPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation()
    event.preventDefault()
    draggingRef.current = true
    setDragging(true)
    clearChromeHideTimer()
    setChromeHidden(false)
    event.currentTarget.setPointerCapture(event.pointerId)
    seekToRatio(ratioFromClientX(event.clientX))
  }

  function onProgressPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    event.stopPropagation()
    seekToRatio(ratioFromClientX(event.clientX))
  }

  function onProgressPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    event.stopPropagation()
    draggingRef.current = false
    setDragging(false)
    seekToRatio(ratioFromClientX(event.clientX))
    setScrub(null)
    scheduleChromeHide()
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }

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

  function closePlayer() {
    if (document.fullscreenElement) {
      void document.exitFullscreen().finally(onClose)
      return
    }
    onClose()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.fullscreenElement) return
        onClose()
      }
      if (event.key === " " || event.key === "k") {
        event.preventDefault()
        setPaused((value) => !value)
      }
      if (event.key === "m") setMuted((value) => !value)
      if (event.key === "f") {
        event.preventDefault()
        toggleFullscreen()
      }
      if (event.key === "ArrowLeft" || event.key === "j") {
        event.preventDefault()
        seekBySeconds(-10)
      }
      if (event.key === "ArrowRight" || event.key === "l") {
        event.preventDefault()
        seekBySeconds(10)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div ref={stageRef} className="absolute inset-0 z-[55] flex flex-col bg-black">
      <div
        className="relative min-h-0 flex-1"
        onClick={() => {
          if (failed) return
          if (chromeHidden || metaHidden) {
            revealAllChrome()
            return
          }
          clearChromeHideTimer()
          setChromeHidden(true)
          setMetaHidden(true)
        }}
      >
        {!failed ? (
          <HlsVideo
            src={movie.video}
            poster={movie.img}
            active
            preload
            muted={muted}
            paused={paused}
            epoch={epoch}
            startAt={30}
            loopOne
            seekApiRef={seekApiRef}
            onBuffering={setBuffering}
            onProgress={(ratio) => {
              if (draggingRef.current) return
              setProgress(ratio)
            }}
            onError={setFailed}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-black px-8 text-center">
            <div>
              <p className="text-base font-medium text-white">这部电影打不开</p>
              <p className="mt-2 text-sm leading-6 text-white/65">可能是网络不稳或地址失效，可以重试或返回列表。</p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black"
                  onClick={(event) => {
                    event.stopPropagation()
                    setFailed(null)
                    setEpoch((value) => value + 1)
                  }}
                >
                  重试
                </button>
                <button
                  type="button"
                  className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white"
                  onClick={(event) => {
                    event.stopPropagation()
                    closePlayer()
                  }}
                >
                  返回
                </button>
              </div>
            </div>
          </div>
        )}

        {paused && !failed && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-black/35 pl-1 backdrop-blur-sm">
              <IconPlay />
            </span>
          </div>
        )}

        {buffering && !paused && !failed && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="h-11 w-11 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
          </div>
        )}

        {seekHint && !failed && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-[max(96px,calc(env(safe-area-inset-top)+84px))]">
            <div
              key={seekHint.key}
              className="movie-seek-hint flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-white ring-1 ring-white/20 backdrop-blur-md"
            >
              <IconSeek
                direction={seekHint.delta < 0 ? "back" : "forward"}
                className="h-5 w-5"
              />
              <span className="text-[13px] font-semibold tracking-wide">
                {seekHint.delta < 0 ? "快退" : "快进"} {Math.abs(seekHint.delta)} 秒
              </span>
            </div>
          </div>
        )}

        <div
          className="movie-chrome movie-chrome-top pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-3 pb-10 pt-[max(10px,env(safe-area-inset-top))]"
          data-hidden={metaHidden ? "true" : "false"}
          aria-hidden={metaHidden}
        >
          <div className="pointer-events-auto flex items-center gap-3">
            <button
              type="button"
              className="movie-back grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white shadow-[0_6px_18px_rgba(0,0,0,0.35)] ring-1 ring-white/25 backdrop-blur-md transition active:scale-95"
              aria-label="返回列表"
              onClick={(event) => {
                event.stopPropagation()
                closePlayer()
              }}
            >
              <IconBack className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-white text-shadow">{movie.title}</p>
            </div>
          </div>
        </div>

        <div
          className="movie-chrome movie-chrome-engage pointer-events-none absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-3"
          data-hidden={metaHidden ? "true" : "false"}
          aria-hidden={metaHidden}
        >
          <button
            type="button"
            className="pointer-events-auto flex flex-col items-center gap-0.5"
            onClick={(event) => {
              event.stopPropagation()
              scheduleChromeHide()
              onToggleLike()
            }}
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-black/35 ring-1 ring-white/20 backdrop-blur-sm">
              <IconHeart filled={liked} className="h-5 w-5" />
            </span>
            <span className="text-shadow text-[11px] font-semibold text-white">{formatCount(movie.likes)}</span>
          </button>
          <button
            type="button"
            className="pointer-events-auto flex flex-col items-center gap-0.5"
            onClick={(event) => {
              event.stopPropagation()
              scheduleChromeHide()
              onToggleSaved()
            }}
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-black/35 ring-1 ring-white/20 backdrop-blur-sm">
              <IconBookmark filled={saved} className="h-5 w-5" />
            </span>
            <span className="text-shadow text-[11px] font-semibold text-white">{formatCount(movie.bookmarks)}</span>
          </button>
        </div>

        <div
          className="movie-chrome movie-chrome-bottom pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-4"
          data-hidden={chromeHidden ? "true" : "false"}
          aria-hidden={chromeHidden}
        >
          <div className="pointer-events-auto mx-auto w-full max-w-[420px]">
            <div
              ref={trackRef}
              className={`movie-progress relative w-full touch-none select-none px-1 py-2 ${dragging ? "cursor-grabbing" : "cursor-pointer"}`}
              role="slider"
              aria-label="播放进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((scrub ?? progress) * 100)}
              tabIndex={0}
              onPointerDown={onProgressPointerDown}
              onPointerMove={onProgressPointerMove}
              onPointerUp={onProgressPointerUp}
              onPointerCancel={onProgressPointerUp}
              onKeyDown={(event) => {
                event.stopPropagation()
                const step = event.shiftKey ? 0.05 : 0.02
                if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                  event.preventDefault()
                  seekToRatio((scrub ?? progress) + step)
                  setScrub(null)
                  scheduleChromeHide()
                } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                  event.preventDefault()
                  seekToRatio((scrub ?? progress) - step)
                  setScrub(null)
                  scheduleChromeHide()
                } else if (event.key === "Home") {
                  event.preventDefault()
                  seekToRatio(0)
                  setScrub(null)
                  scheduleChromeHide()
                } else if (event.key === "End") {
                  event.preventDefault()
                  seekToRatio(1)
                  setScrub(null)
                  scheduleChromeHide()
                }
              }}
            >
              {(() => {
                const pct = Math.max(0, Math.min(100, (scrub ?? progress) * 100))
                return (
                  <div className="relative h-2.5 w-full">
                    <div className="absolute inset-0 rounded-full bg-white/15 ring-1 ring-white/10" />
                    <div
                      className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
                      style={{ width: `${pct}%` }}
                    >
                      <div className="h-full w-full rounded-full bg-gradient-to-r from-[#fe2c55] via-[#ff6b8a] to-[#25f4ee]" />
                    </div>
                    <span
                      className={`movie-progress-thumb absolute top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-[#fe2c55]/70 ${
                        dragging ? "h-5 w-5" : "h-4 w-4"
                      }`}
                      style={{ left: `${pct}%` }}
                    />
                  </div>
                )
              })()}
            </div>

            <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-0.5">
              <div className="justify-self-start">
                <button
                  type="button"
                  className="grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white shadow-[0_6px_18px_rgba(0,0,0,0.3)] ring-1 ring-white/20 backdrop-blur-md transition active:scale-95"
                  aria-label={muted ? "打开声音" : "静音"}
                  onClick={(event) => {
                    event.stopPropagation()
                    scheduleChromeHide()
                    setMuted((value) => !value)
                  }}
                >
                  <IconVolume muted={muted} className="h-5 w-5" />
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  className="grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white shadow-[0_6px_18px_rgba(0,0,0,0.3)] ring-1 ring-white/20 backdrop-blur-md transition active:scale-95"
                  aria-label="快退 10 秒"
                  onClick={(event) => {
                    event.stopPropagation()
                    seekBySeconds(-10)
                  }}
                >
                  <IconSeek direction="back" className="h-[18px] w-[18px]" />
                </button>

                <button
                  type="button"
                  className="grid h-11 w-11 place-items-center rounded-full bg-[#fe2c55] text-white shadow-[0_8px_22px_rgba(254,44,85,0.4)] ring-1 ring-white/20 transition active:scale-95"
                  aria-label={paused ? "播放" : "暂停"}
                  onClick={(event) => {
                    event.stopPropagation()
                    setPaused((value) => !value)
                  }}
                >
                  {paused ? <IconPlay className="h-5 w-5" /> : <IconPause className="h-5 w-5" />}
                </button>

                <button
                  type="button"
                  className="grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white shadow-[0_6px_18px_rgba(0,0,0,0.3)] ring-1 ring-white/20 backdrop-blur-md transition active:scale-95"
                  aria-label="快进 10 秒"
                  onClick={(event) => {
                    event.stopPropagation()
                    seekBySeconds(10)
                  }}
                >
                  <IconSeek direction="forward" className="h-[18px] w-[18px]" />
                </button>
              </div>

              <div className="justify-self-end">
                <button
                  type="button"
                  className="grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white shadow-[0_6px_18px_rgba(0,0,0,0.3)] ring-1 ring-white/20 backdrop-blur-md transition active:scale-95"
                  aria-label={fullscreen ? "退出全屏" : "全屏"}
                  onClick={(event) => {
                    event.stopPropagation()
                    scheduleChromeHide()
                    toggleFullscreen()
                  }}
                >
                  <IconFullscreen active={fullscreen} className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
