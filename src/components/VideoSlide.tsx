"use client"

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react"
import { HlsVideo } from "@/components/HlsVideo"
import { IconBookmark, IconHeart, IconLoopMode, IconPlay } from "@/components/icons"
import { useT } from "@/components/LocaleProvider"
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
  loopOne: boolean
  chromeHidden?: boolean
  onPausedChange: (paused: boolean) => void
  onToggleSaved: () => void
  onToggleLike: () => void
  onToggleLoop: () => void
  onEnded: () => void
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
  loopOne,
  chromeHidden = false,
  onPausedChange,
  onToggleSaved,
  onToggleLike,
  onToggleLoop,
  onEnded,
}: Props) {
  const t = useT()
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

  useEffect(() => {
    // 仅切到新条目时亮 loading；pause/resume 交给 HlsVideo，避免和 play 成功抢状态
    if (active && !paused && !failed) setBuffering(true)
  }, [active, failed, video.src])

  // 点赞/收藏：切到本条 / 开始播放时出现，真正播起来后再停 3 秒隐藏
  const [engageHidden, setEngageHidden] = useState(false)
  useEffect(() => {
    if (!active || paused || failed || buffering) {
      setEngageHidden(false)
      return
    }
    setEngageHidden(false)
    const timer = window.setTimeout(() => setEngageHidden(true), 5000)
    return () => window.clearTimeout(timer)
  }, [active, paused, failed, buffering, video.src])

  function media() {
    return rootRef.current?.querySelector("video") ?? null
  }

  function play() {
    const element = media()
    if (!element) return
    void element
      .play()
      .then(() => {
        setBuffering(false)
      })
      .catch(() => {})
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

    // 卡在 loading 时，单击当作强制起播，不要先暂停
    if (buffering) {
      play()
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
        loopOne={loopOne}
        onBuffering={setBuffering}
        onProgress={setProgress}
        onError={setFailed}
        onEnded={onEnded}
      />

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
            <p className="text-base font-medium">{t("video.cannotPlay")}</p>
            <p className="mt-2 text-sm leading-6 text-white/65">{t("video.cannotPlayHint")}</p>
            <button
              type="button"
              className="mt-4 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black"
              onClick={() => {
                setFailed(null)
                setEpoch((value) => value + 1)
              }}
            >
              {t("video.retry")}
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
              {expanded ? t("video.collapse") : t("video.expand")}
            </button>
          )}
        </div>

        <div className="pointer-events-auto flex flex-col items-center gap-4 pb-1">
          <div
            className={`feed-profile flex flex-col items-center gap-4 ${
              engageHidden ? "pointer-events-none" : ""
            }`}
            data-hidden={engageHidden ? "true" : "false"}
            style={{
              opacity: engageHidden ? 0 : 1,
              transform: engageHidden ? "translate3d(120%, 0, 0)" : "translate3d(0, 0, 0)",
            }}
            aria-hidden={engageHidden}
          >
            <RailButton label={t("video.like")} count={video.likes} pressed={liked} onClick={toggleLike}>
              <IconHeart filled={liked} />
            </RailButton>
            <RailButton
              label={t("video.save")}
              count={video.bookmarks}
              pressed={saved}
              onClick={onToggleSaved}
            >
              <IconBookmark filled={saved} />
            </RailButton>
          </div>
          <div
            className={`feed-profile ${chromeHidden ? "pointer-events-none" : ""}`}
            data-hidden={chromeHidden ? "true" : "false"}
            style={{
              opacity: chromeHidden ? 0 : 1,
              transform: chromeHidden ? "translate3d(120%, 0, 0)" : "translate3d(0, 0, 0)",
            }}
            aria-hidden={chromeHidden}
          >
            <RailButton
              label={loopOne ? t("video.loop") : t("video.continuous")}
              pressed={loopOne}
              onClick={onToggleLoop}
            >
              <IconLoopMode loopOne={loopOne} />
            </RailButton>
          </div>
          {/* 给右下角个人中心头像留空，避免挡住循环按钮 */}
          <div className="mt-1 h-11 w-11" aria-hidden />
        </div>
      </div>

      {active && (
        <div className="absolute inset-x-0 bottom-0 z-30 h-6" onPointerDown={seek}>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
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
  count?: number
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="flex flex-col items-center gap-1" aria-label={label} aria-pressed={pressed} onClick={onClick}>
      <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,.55)]">{children}</span>
      <span className={`text-shadow text-[12px] font-semibold ${pressed ? "text-[#25f4ee]" : ""}`}>
        {typeof count === "number" ? formatCount(count) : label}
      </span>
    </button>
  )
}
