"use client"

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react"
import { HlsVideo } from "@/components/HlsVideo"
import { IconBookmark, IconHeart, IconPlay, IconUser } from "@/components/icons"
import { formatCount } from "@/lib/format"
import type { VideoItem } from "@/lib/types"

type Props = {
  video: VideoItem
  index: number
  active: boolean
  preload: boolean
  muted: boolean
  paused: boolean
  saved: boolean
  liked: boolean
  profileName: string | null
  onPausedChange: (paused: boolean) => void
  onToggleSaved: () => void
  onToggleLike: () => void
  onOpenProfile: () => void
}

export function VideoSlide({
  video,
  index,
  active,
  preload,
  muted,
  paused,
  saved,
  liked,
  profileName,
  onPausedChange,
  onToggleSaved,
  onToggleLike,
  onOpenProfile,
}: Props) {
  const rootRef = useRef<HTMLElement>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const lastTapRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [buffering, setBuffering] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)
  const [epoch, setEpoch] = useState(0)
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number; dx: number }[]>([])
  const [mediaKey, setMediaKey] = useState(`${video.src}:0`)
  const nextMediaKey = `${video.src}:${epoch}`
  if (mediaKey !== nextMediaKey) {
    setMediaKey(nextMediaKey)
    setBuffering(true)
    setFailed(null)
    setProgress(0)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  function media() {
    return rootRef.current?.querySelector("video") ?? null
  }

  function play() {
    const element = media()
    if (!element) return
    void element.play().catch(() => {})
  }

  function pause() {
    media()?.pause()
  }

  function likeAt(x: number, y: number) {
    if (!liked) onToggleLike()
    const burst = [0, 1, 2].map((offset) => ({
      id: Date.now() + offset + Math.random(),
      x,
      y,
      dx: (offset - 1) * 26,
    }))
    setHearts((current) => [...current, ...burst])
    window.setTimeout(() => {
      setHearts((current) => current.filter((heart) => !burst.some((item) => item.id === heart.id)))
    }, 800)
  }

  function toggleLike() {
    onToggleLike()
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!active) return
    if (event.pointerType === "mouse" && event.button !== 0) return
    const start = startRef.current
    startRef.current = null
    if (!start) return
    if (Math.abs(event.clientX - start.x) > 16 || Math.abs(event.clientY - start.y) > 16) return

    const now = Date.now()
    const isDouble = now - lastTapRef.current < 280
    lastTapRef.current = isDouble ? 0 : now
    const rect = event.currentTarget.getBoundingClientRect()

    if (isDouble) {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = null
      likeAt(event.clientX - rect.left, event.clientY - rect.top)
      if (paused) {
        play()
        onPausedChange(false)
      }
      return
    }

    if (paused) {
      play()
      onPausedChange(false)
      return
    }

    timerRef.current = window.setTimeout(() => {
      pause()
      onPausedChange(true)
      timerRef.current = null
    }, 260)
  }

  function seek(event: PointerEvent<HTMLDivElement>) {
    const videoElement = media()
    if (!videoElement?.duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    videoElement.currentTime = ratio * videoElement.duration
    setProgress(ratio)
  }

  return (
    <article
      ref={rootRef}
      data-index={index}
      data-active={active ? "true" : "false"}
      className="feed-slide"
    >
      <HlsVideo
        src={video.src}
        poster={video.poster}
        active={active}
        preload={preload || active}
        muted={muted}
        paused={!active || paused}
        epoch={epoch}
        onBuffering={setBuffering}
        onProgress={setProgress}
        onError={setFailed}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-32 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-72 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

      <div
        className="absolute inset-0 z-10 touch-manipulation"
        onPointerDown={(event) => {
          startRef.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerUp={onPointerUp}
      />

      {active && paused && !failed && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-black/35 pl-1 backdrop-blur-sm">
            <IconPlay />
          </span>
        </div>
      )}

      {active && buffering && !paused && !failed && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <span className="h-11 w-11 animate-spin rounded-full border-[3px] border-white/30 border-t-white shadow-[0_0_24px_rgba(0,0,0,.35)]" />
        </div>
      )}

      {failed && active && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/55 px-8 text-center">
          <div>
            <p className="text-base font-medium">这段视频打不开</p>
            <p className="mt-2 text-sm leading-6 text-white/65">
              确认 m3u8 和分片都在 R2，并允许当前网站跨域读取。也可以临时打开 HLS_PROXY。
            </p>
            <button
              type="button"
              className="mt-4 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black"
              onClick={() => {
                setFailed(null)
                setEpoch((value) => value + 1)
              }}
            >
              重试
            </button>
          </div>
        </div>
      )}

      {hearts.map((heart) => (
        <span
          key={heart.id}
          className="pointer-events-none absolute z-20"
          style={{
            left: heart.x,
            top: heart.y,
            ["--dx" as string]: `${heart.dx}px`,
            animation: "float-heart 720ms ease-out forwards",
          }}
        >
          <IconHeart filled className="h-16 w-16" />
        </span>
      ))}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 px-4 pb-[max(18px,env(safe-area-inset-bottom))]">
        <div className="min-w-0 flex-1 text-shadow">
          {video.description && (
            <p className={`text-[15px] leading-snug ${expanded ? "" : "line-clamp-2"}`}>
              {video.description}
            </p>
          )}
          {video.description.length > 32 && (
            <button
              type="button"
              className="pointer-events-auto mt-1 text-sm font-semibold text-white/80"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "收起" : "展开"}
            </button>
          )}
        </div>

        <div className="pointer-events-auto flex flex-col items-center gap-4 pb-1">
          <RailButton label="点赞" count={video.likes} pressed={liked} onClick={toggleLike}>
            <IconHeart filled={liked} />
          </RailButton>
          <RailButton
            label="收藏"
            count={video.bookmarks}
            pressed={saved}
            onClick={onToggleSaved}
          >
            <IconBookmark filled={saved} />
          </RailButton>
          <button
            type="button"
            aria-label="个人中心"
            className="mt-1 grid place-items-center"
            onClick={onOpenProfile}
          >
            <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 border-white/80 bg-gradient-to-br from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-base font-semibold text-white">
              {profileName ? Array.from(profileName)[0] : <IconUser />}
            </span>
          </button>
        </div>
      </div>

      {active && (
        <div className="absolute inset-x-0 bottom-0 z-30 h-4" onPointerDown={seek}>
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
            <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}
    </article>
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
    <button type="button" className="flex flex-col items-center gap-1" aria-label={label} aria-pressed={pressed} onClick={onClick}>
      <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,.55)]">{children}</span>
      <span className="text-shadow text-[12px] font-semibold">{formatCount(count)}</span>
    </button>
  )
}
