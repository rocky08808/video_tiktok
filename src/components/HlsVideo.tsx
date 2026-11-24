"use client"

import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react"
import type Hls from "hls.js"
import { resolveLocale, translate } from "@/lib/i18n"

function t(key: string) {
  return translate(resolveLocale(), key)
}

function normalizeRate(rate: number | undefined) {
  return Number.isFinite(rate) && (rate as number) > 0 ? (rate as number) : 1
}

export type HlsSeekApi = {
  seekRatio: (ratio: number) => void
  /** 相对当前时间偏移秒数（可负） */
  seekBy: (seconds: number) => void
  /** 立即写入 video.playbackRate（不等待 React effect） */
  setPlaybackRate: (rate: number) => void
}

type Props = {
  src: string
  poster?: string
  active: boolean
  preload: boolean
  muted: boolean
  /** 0–1，与 muted 独立；muted 时仍保留音量值 */
  volume?: number
  /** 播放倍速，默认 1 */
  playbackRate?: number
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
  volume = 1,
  playbackRate = 1,
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
  const playbackRateRef = useRef(normalizeRate(playbackRate))
  const skippedRef = useRef(false)
  const playGenRef = useRef(0)
  const playRetryRef = useRef<number | null>(null)
  const stallRetryRef = useRef<number | null>(null)
  const rateWatchRef = useRef<number | null>(null)
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
    playbackRateRef.current = normalizeRate(playbackRate)
    if (!active) setShowPoster(Boolean(poster))
  }, [active, paused, poster, startAt, loopOne, playbackRate, onBuffering, onProgress, onError, onEnded])

  /** 倍速越高越吃缓冲；按倍率拉长 hls 缓冲，避免画面卡在接近 1x */
  function syncHlsForRate(rate = playbackRateRef.current) {
    const player = playerRef.current
    if (!player) return
    const factor = Math.max(1, rate)
    player.config.maxBufferLength = Math.min(60, Math.round(18 * factor))
    player.config.maxMaxBufferLength = Math.min(120, Math.round(36 * factor))
    player.config.backBufferLength = Math.min(30, Math.round(8 * factor))
    // 加速时略偏保守选档，解码更跟得上
    player.config.abrBandWidthFactor = rate >= 1.5 ? 0.7 : 0.95
    player.config.abrBandWidthUpFactor = rate >= 1.5 ? 0.6 : 0.7
    try {
      if (!videoRef.current?.paused) player.startLoad()
    } catch {
      // ignore
    }
  }

  /** 只靠原生 playbackRate 带动音画；软追帧只会推进度条、画面仍像 1x */
  function applyPlaybackRate() {
    const video = videoRef.current
    if (!video) return
    const next = playbackRateRef.current
    try {
      video.defaultPlaybackRate = next
      video.playbackRate = next
    } catch {
      // ignore
    }
  }

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
          applyPlaybackRate()
          window.setTimeout(() => applyPlaybackRate(), 0)
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
          applyPlaybackRate()
          window.setTimeout(() => applyPlaybackRate(), 0)
        } catch {
          // ignore seek errors mid-load
        }
      },
      setPlaybackRate: (rate: number) => {
        playbackRateRef.current = normalizeRate(rate)
        applyPlaybackRate()
        syncHlsForRate(playbackRateRef.current)
        window.setTimeout(() => applyPlaybackRate(), 0)
        window.setTimeout(() => applyPlaybackRate(), 50)
        window.setTimeout(() => applyPlaybackRate(), 200)
      },
    }
    return () => {
      seekApiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekApiRef, src, epoch])

  function clearPlayRetry() {
    if (playRetryRef.current != null) {
      window.clearTimeout(playRetryRef.current)
      playRetryRef.current = null
    }
  }

  function clearStallRetry() {
    if (stallRetryRef.current != null) {
      window.clearTimeout(stallRetryRef.current)
      stallRetryRef.current = null
    }
  }

  function scheduleStallRecovery() {
    const video = videoRef.current
    if (!video || !activeRef.current || pausedRef.current) return
    clearStallRetry()
    stallRetryRef.current = window.setTimeout(() => {
      stallRetryRef.current = null
      if (!activeRef.current || pausedRef.current) return
      if (!video.paused && video.readyState >= 3) {
        markPlaying()
        return
      }
      try {
        playerRef.current?.startLoad()
      } catch {
        // ignore
      }
      requestPlay("stall")
    }, 900)
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
      applyPlaybackRate()
      return
    }
    // 时长还没出来时先跳；后续 metadata 再校正
    skippedRef.current = true
    try {
      video.currentTime = at
    } catch {
      skippedRef.current = false
    }
    applyPlaybackRate()
  }

  function markPlaying() {
    clearStallRetry()
    setShowPoster(false)
    onBufferingRef.current(false)
    applyPlaybackRate()
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
    applyPlaybackRate()

    const attempt = (n: number) => {
      if (gen !== playGenRef.current) return
      if (!activeRef.current || pausedRef.current) return
      applyPlaybackRate()
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
          applyPlaybackRate()
        })
        .catch(() => {
          if (gen !== playGenRef.current) return
          if (!activeRef.current || pausedRef.current) return
          onBufferingRef.current(true)
          playRetryRef.current = window.setTimeout(
            () => attempt(n + 1),
            Math.min(1000, 160 * (n + 1)),
          )
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
        onErrorRef.current(t("hls.noHls"))
        return
      }

      if (
        typeof MediaSource !== "undefined" &&
        typeof MediaSource.isTypeSupported === "function" &&
        !MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"')
      ) {
        onErrorRef.current(t("hls.loadFailed"))
        return
      }

      let recovered = 0
      const startPosition = startAtRef.current > 0 ? startAtRef.current : -1
      const player = new HlsCtor({
        enableWorker: false,
        // VOD 关掉低延迟追赶，避免 latency-controller 改写 playbackRate
        lowLatencyMode: false,
        maxLiveSyncPlaybackRate: 1,
        loader: FetchLoader,
        fetchSetup: (_context, init) =>
          new Request(_context.url, {
            ...init,
            referrerPolicy: "no-referrer",
          }),
        startLevel: 0,
        startPosition,
        capLevelToPlayerSize: true,
        // 电影倍速会吃缓冲，默认就给宽裕一些
        maxBufferLength: 18,
        maxMaxBufferLength: 36,
        backBufferLength: 8,
      })
      playerRef.current = player
      syncHlsForRate(playbackRateRef.current)
      const fail = () => {
        player.destroy()
        if (playerRef.current === player) playerRef.current = null
        onErrorRef.current(t("hls.loadFailed"))
      }
      const keepRate = () => applyPlaybackRate()
      player.on(HlsCtor.Events.MEDIA_ATTACHED, keepRate)
      player.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        applyStartAt()
        keepRate()
        syncHlsForRate()
        if (activeRef.current && !pausedRef.current) requestPlay("manifest")
      })
      player.on(HlsCtor.Events.FRAG_BUFFERED, () => {
        keepRate()
        if (!activeRef.current || pausedRef.current) return
        if (!video.paused && video.readyState >= 2) markPlaying()
      })
      player.on(HlsCtor.Events.FRAG_CHANGED, keepRate)
      player.on(HlsCtor.Events.BUFFER_FLUSHED, keepRate)
      player.on(HlsCtor.Events.LEVEL_SWITCHED, keepRate)
      player.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (!data.fatal || playerRef.current !== player) return
        recovered += 1
        if (recovered > 2) {
          fail()
          return
        }
        if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) player.startLoad()
        else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
          player.recoverMediaError()
          window.setTimeout(keepRate, 0)
        } else fail()
      })
      player.loadSource(src)
      player.attachMedia(video)
      keepRate()
    }

    void attach()

    return () => {
      destroyed = true
      playGenRef.current += 1
      clearPlayRetry()
      clearStallRetry()
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
    const next = Math.max(0, Math.min(1, volume))
    video.volume = next
  }, [volume])

  useLayoutEffect(() => {
    playbackRateRef.current = normalizeRate(playbackRate)
    applyPlaybackRate()
    syncHlsForRate(playbackRateRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackRate])

  // 只校正被打回的 playbackRate，不用 seek 假加速（那会造成「进度快了画面没跟上」）
  useEffect(() => {
    if (rateWatchRef.current != null) {
      window.clearInterval(rateWatchRef.current)
      rateWatchRef.current = null
    }
    rateWatchRef.current = window.setInterval(() => {
      const video = videoRef.current
      if (!video || video.paused) return
      if (Math.abs(video.playbackRate - playbackRateRef.current) >= 0.001) {
        applyPlaybackRate()
      }
    }, 250)
    return () => {
      if (rateWatchRef.current != null) {
        window.clearInterval(rateWatchRef.current)
        rateWatchRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, epoch])

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
    const playbackWatch = window.setInterval(() => {
      const video = videoRef.current
      if (!video || !activeRef.current || pausedRef.current) return
      if (video.paused || video.readyState < 3) {
        requestPlay("watch")
      }
    }, 1000)
    const retryOnVisibility = () => {
      if (document.visibilityState === "visible" && activeRef.current && !pausedRef.current) {
        requestPlay("visible")
      }
    }
    document.addEventListener("visibilitychange", retryOnVisibility)
    window.addEventListener("focus", retryOnVisibility)
    return () => {
      playGenRef.current += 1
      clearPlayRetry()
      clearStallRetry()
      window.clearInterval(playbackWatch)
      document.removeEventListener("visibilitychange", retryOnVisibility)
      window.removeEventListener("focus", retryOnVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, preload])

  return (
    <>
      <video
        ref={(node) => {
          videoRef.current = node
          if (node) {
            node.setAttribute("referrerpolicy", "no-referrer")
            // 初次挂载立刻写入，避免先以 1x 起播
            const next = playbackRateRef.current
            try {
              node.defaultPlaybackRate = next
              node.playbackRate = next
            } catch {
              // ignore
            }
          }
        }}
        className="media-fit absolute top-1/2 left-0 w-full -translate-y-1/2"
        playsInline
        autoPlay={active && !paused && preload}
        loop={loopOne}
        muted={muted}
        poster={poster}
        preload={preload ? "auto" : "none"}
        disablePictureInPicture
        onContextMenu={(event) => event.preventDefault()}
        onPlaying={() => {
          markPlaying()
          applyPlaybackRate()
        }}
        onSeeked={() => applyPlaybackRate()}
        onRateChange={() => {
          // 推迟一帧再写回，避开同回合内被打回 1 却跳过校正的竞态
          window.requestAnimationFrame(() => applyPlaybackRate())
        }}
        onLoadedMetadata={() => {
          applyStartAt()
          applyPlaybackRate()
        }}
        onLoadedData={() => {
          applyStartAt()
          applyPlaybackRate()
          if (activeRef.current && !pausedRef.current && videoRef.current && videoRef.current.readyState >= 2) {
            requestPlay("loadeddata")
          }
        }}
        onCanPlay={() => {
          applyStartAt()
          applyPlaybackRate()
          if (activeRef.current && !pausedRef.current) requestPlay("canplay")
        }}
        onWaiting={() => {
          if (activeRef.current && !pausedRef.current) {
            onBufferingRef.current(true)
            scheduleStallRecovery()
          }
        }}
        onStalled={() => {
          if (activeRef.current && !pausedRef.current) {
            onBufferingRef.current(true)
            scheduleStallRecovery()
          }
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget
          if (Math.abs(video.playbackRate - playbackRateRef.current) >= 0.001) {
            applyPlaybackRate()
          }
          if (video.duration && Number.isFinite(video.duration)) {
            onProgressRef.current(video.currentTime / video.duration)
          }
          if (!video.paused && video.readyState >= 2) markPlaying()
        }}
        onEnded={(event) => {
          const video = event.currentTarget
          if (loopOneRef.current) {
            video.currentTime = 0
            applyPlaybackRate()
            if (activeRef.current && !pausedRef.current) requestPlay("ended")
            return
          }
          onEndedRef.current?.()
        }}
        onError={() => {
          if (nativeRef.current) onErrorRef.current(t("hls.loadFailed"))
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
