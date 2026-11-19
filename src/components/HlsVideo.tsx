"use client"

import { useEffect, useRef, useState, type MutableRefObject } from "react"
import type Hls from "hls.js"

export type HlsSeekApi = {
  seekRatio: (ratio: number) => void
  /** 相对当前时间偏移秒数（可负） */
  seekBy: (seconds: number) => void
}

type Props = {
  src: string
  poster?: string
  active: boolean
  preload: boolean
  muted: boolean
  paused: boolean
  epoch: number
  /** 开播跳到指定秒数（如片头） */
  startAt?: number
  /** true：单条循环；false：播完回调 onEnded */
  loopOne?: boolean
  seekApiRef?: MutableRefObject<HlsSeekApi | null>
  onBuffering: (buffering: boolean) => void
  onProgress: (ratio: number) => void
  onError: (message: string) => void
  onEnded?: () => void
}

export function HlsVideo({
  src,
  poster,
  active,
  preload,
  muted,
  paused,
  epoch,
  startAt = 0,
  loopOne = true,
  seekApiRef,
  onBuffering,
  onProgress,
  onError,
  onEnded,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<Hls | null>(null)
  const nativeRef = useRef(false)
  const activeRef = useRef(active)
  const pausedRef = useRef(paused)
  const onBufferingRef = useRef(onBuffering)
  const onProgressRef = useRef(onProgress)
  const onErrorRef = useRef(onError)
  const onEndedRef = useRef(onEnded)
  const loopOneRef = useRef(loopOne)
  const startAtRef = useRef(Math.max(0, startAt))
  const skippedRef = useRef(false)
  const playGenRef = useRef(0)
  const playRetryRef = useRef<number | null>(null)
  const [posterKey, setPosterKey] = useState(`${src}:${epoch}`)
  const [showPoster, setShowPoster] = useState(Boolean(poster))
  const nextPosterKey = `${src}:${epoch}`
  if (posterKey !== nextPosterKey) {
    setPosterKey(nextPosterKey)
    setShowPoster(Boolean(poster))
  }

  useEffect(() => {
    activeRef.current = active
    pausedRef.current = paused
    onBufferingRef.current = onBuffering
    onProgressRef.current = onProgress
    onErrorRef.current = onError
    onEndedRef.current = onEnded
    loopOneRef.current = loopOne
    startAtRef.current = Math.max(0, startAt)
    if (!active) setShowPoster(Boolean(poster))
  }, [active, paused, poster, startAt, loopOne, onBuffering, onProgress, onError, onEnded])

  useEffect(() => {
    if (!seekApiRef) return
    seekApiRef.current = {
      seekRatio: (ratio: number) => {
        const video = videoRef.current
        if (!video) return
        const duration = video.duration
        if (!Number.isFinite(duration) || duration <= 0) return
        const next = Math.max(0, Math.min(1, ratio)) * duration
        try {
          video.currentTime = next
          onProgressRef.current(next / duration)
        } catch {
          // ignore seek errors mid-load
        }
      },
      seekBy: (seconds: number) => {
        const video = videoRef.current
        if (!video) return
        const duration = video.duration
        const current = video.currentTime
        if (!Number.isFinite(current)) return
        const max = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY
        const next = Math.max(0, Math.min(max, current + seconds))
        try {
          video.currentTime = next
          if (Number.isFinite(duration) && duration > 0) {
            onProgressRef.current(next / duration)
          }
        } catch {
          // ignore seek errors mid-load
        }
      },
    }
    return () => {
      seekApiRef.current = null
    }
  }, [seekApiRef, src, epoch])

  function clearPlayRetry() {
    if (playRetryRef.current != null) {
      window.clearTimeout(playRetryRef.current)
      playRetryRef.current = null
    }
  }

  function applyStartAt() {
    const video = videoRef.current
    if (!video || skippedRef.current) return
    const at = startAtRef.current
    if (!at || at <= 0) return
    const duration = video.duration
    if (Number.isFinite(duration) && duration > 0) {
      skippedRef.current = true
      video.currentTime = Math.min(at, Math.max(0, duration - 0.25))
      return
    }
    // 时长还没出来时先跳；后续 metadata 再校正
    skippedRef.current = true
    try {
      video.currentTime = at
    } catch {
      skippedRef.current = false
    }
  }

  function markPlaying() {
    setShowPoster(false)
    onBufferingRef.current(false)
  }

  function requestPlay(reason: string) {
    const video = videoRef.current
    if (!video) return
    if (!activeRef.current || pausedRef.current) {
      video.pause()
      return
    }

    const gen = ++playGenRef.current
    clearPlayRetry()
    onBufferingRef.current(true)

    const attempt = (n: number) => {
      if (gen !== playGenRef.current) return
      if (!activeRef.current || pausedRef.current) return
      void video
        .play()
        .then(() => {
          if (gen !== playGenRef.current) return
          if (!activeRef.current || pausedRef.current) {
            video.pause()
            return
          }
          // play() 已成功时，有的环境不会再发 playing，不能只靠事件清 loading
          markPlaying()
        })
        .catch(() => {
          if (gen !== playGenRef.current) return
          if (!activeRef.current || pausedRef.current) return
          onBufferingRef.current(true)
          if (n >= 5) return
          playRetryRef.current = window.setTimeout(() => attempt(n + 1), 160 * (n + 1))
        })
    }

    void reason
    attempt(0)
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video || !preload) return

    let destroyed = false
    nativeRef.current = false
    skippedRef.current = false
    if (activeRef.current) onBufferingRef.current(true)

    const attach = async () => {
      const { default: HlsCtor, FetchLoader } = await import("hls.js")
      if (destroyed) return
      if (!HlsCtor.isSupported()) {
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          nativeRef.current = true
          video.src = src
          if (activeRef.current && !pausedRef.current) requestPlay("native")
          return
        }
        onErrorRef.current("当前浏览器不能播放 HLS")
        return
      }

      let recovered = 0
      const startPosition = startAtRef.current > 0 ? startAtRef.current : -1
      const player = new HlsCtor({
        enableWorker: false,
        loader: FetchLoader,
        fetchSetup: (_context, init) =>
          new Request(_context.url, {
            ...init,
            referrerPolicy: "no-referrer",
          }),
        startLevel: 0,
        startPosition,
        capLevelToPlayerSize: true,
        maxBufferLength: 8,
        maxMaxBufferLength: 12,
        backBufferLength: 6,
      })
      playerRef.current = player
      const fail = () => {
        player.destroy()
        if (playerRef.current === player) playerRef.current = null
        onErrorRef.current("视频加载失败")
      }
      player.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        applyStartAt()
        if (activeRef.current && !pausedRef.current) requestPlay("manifest")
      })
      player.on(HlsCtor.Events.FRAG_BUFFERED, () => {
        if (!activeRef.current || pausedRef.current) return
        if (!video.paused && video.readyState >= 2) markPlaying()
      })
      player.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (!data.fatal || playerRef.current !== player) return
        recovered += 1
        if (recovered > 2) {
          fail()
          return
        }
        if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) player.startLoad()
        else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) player.recoverMediaError()
        else fail()
      })
      player.loadSource(src)
      player.attachMedia(video)
    }

    void attach()

    return () => {
      destroyed = true
      playGenRef.current += 1
      clearPlayRetry()
      playerRef.current?.destroy()
      playerRef.current = null
      video.pause()
      video.removeAttribute("src")
      video.load()
    }
    // requestPlay / markPlaying 用 ref，避免进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, preload, epoch])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = muted
  }, [muted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!(active && !paused && preload)) {
      playGenRef.current += 1
      clearPlayRetry()
      video.pause()
      return
    }
    if (poster) setShowPoster(true)
    requestPlay("active")
    return () => {
      playGenRef.current += 1
      clearPlayRetry()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, preload])

  return (
    <>
      <video
        ref={(node) => {
          videoRef.current = node
          if (node) node.setAttribute("referrerpolicy", "no-referrer")
        }}
        className="media-fit absolute top-1/2 left-0 w-full -translate-y-1/2"
        playsInline
        loop={loopOne}
        muted={muted}
        poster={poster}
        preload={preload ? "auto" : "none"}
        disablePictureInPicture
        onContextMenu={(event) => event.preventDefault()}
        onPlaying={markPlaying}
        onLoadedMetadata={() => {
          applyStartAt()
        }}
        onLoadedData={() => {
          applyStartAt()
          if (activeRef.current && !pausedRef.current && videoRef.current && videoRef.current.readyState >= 2) {
            requestPlay("loadeddata")
          }
        }}
        onCanPlay={() => {
          applyStartAt()
          if (activeRef.current && !pausedRef.current) requestPlay("canplay")
        }}
        onWaiting={() => {
          if (activeRef.current && !pausedRef.current) onBufferingRef.current(true)
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget
          if (video.duration && Number.isFinite(video.duration)) {
            onProgressRef.current(video.currentTime / video.duration)
          }
          if (!video.paused && video.readyState >= 2) markPlaying()
        }}
        onEnded={(event) => {
          const video = event.currentTarget
          if (loopOneRef.current) {
            video.currentTime = 0
            if (activeRef.current && !pausedRef.current) requestPlay("ended")
            return
          }
          onEndedRef.current?.()
        }}
        onError={() => {
          if (nativeRef.current) onErrorRef.current("视频加载失败")
        }}
      />
      {poster && showPoster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          referrerPolicy="no-referrer"
          className="media-fit absolute top-1/2 left-0 z-[2] w-full -translate-y-1/2"
          onError={() => setShowPoster(false)}
        />
      )}
    </>
  )
}
