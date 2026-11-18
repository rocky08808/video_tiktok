"use client"

import { useEffect, useRef, useState } from "react"
import type Hls from "hls.js"

type Props = {
  src: string
  poster?: string
  active: boolean
  preload: boolean
  muted: boolean
  paused: boolean
  epoch: number
  onBuffering: (buffering: boolean) => void
  onProgress: (ratio: number) => void
  onError: (message: string) => void
}

export function HlsVideo({
  src,
  poster,
  active,
  preload,
  muted,
  paused,
  epoch,
  onBuffering,
  onProgress,
  onError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<Hls | null>(null)
  const nativeRef = useRef(false)
  const activeRef = useRef(active)
  const pausedRef = useRef(paused)
  const onBufferingRef = useRef(onBuffering)
  const onProgressRef = useRef(onProgress)
  const onErrorRef = useRef(onError)
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
    if (!active) setShowPoster(Boolean(poster))
  }, [active, paused, poster, onBuffering, onProgress, onError])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !preload) return

    let destroyed = false
    nativeRef.current = false
    onBufferingRef.current(true)

    const playIfNeeded = () => {
      if (!video || destroyed) return
      if (!activeRef.current || pausedRef.current) {
        video.pause()
        return
      }
      void video
        .play()
        .then(() => {
          if (!activeRef.current || pausedRef.current) video.pause()
        })
        .catch(() => {})
    }

    const attach = async () => {
      const { default: HlsCtor, FetchLoader } = await import("hls.js")
      if (destroyed) return
      if (!HlsCtor.isSupported()) {
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          nativeRef.current = true
          video.src = src
          playIfNeeded()
          return
        }
        onErrorRef.current("当前浏览器不能播放 HLS")
        return
      }

      let recovered = 0
      // R2/CDN 会拦带 localhost Referer 的请求（403），用 fetch + no-referrer
      const player = new HlsCtor({
        enableWorker: false,
        loader: FetchLoader,
        fetchSetup: (_context, init) =>
          new Request(_context.url, {
            ...init,
            referrerPolicy: "no-referrer",
          }),
        // 先从最低档起播，出画后再自动升清晰度
        startLevel: 0,
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
      player.on(HlsCtor.Events.MANIFEST_PARSED, playIfNeeded)
      player.on(HlsCtor.Events.FRAG_BUFFERED, () => {
        if (activeRef.current && video.readyState >= 2) onBufferingRef.current(false)
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
      playerRef.current?.destroy()
      playerRef.current = null
      video.pause()
      video.removeAttribute("src")
      video.load()
    }
  }, [src, preload, epoch])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = muted
  }, [muted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (active && !paused) {
      void video
        .play()
        .then(() => {
          if (!activeRef.current || pausedRef.current) video.pause()
        })
        .catch(() => {})
      return
    }
    video.pause()
  }, [active, paused, preload])

  function markReady() {
    const element = videoRef.current
    if (!element) return
    if (element.readyState >= 2 || element.videoWidth > 0) {
      setShowPoster(false)
      onBufferingRef.current(false)
    }
  }

  return (
    <>
      <video
        ref={(node) => {
          videoRef.current = node
          if (node) node.setAttribute("referrerpolicy", "no-referrer")
        }}
        className="media-fit absolute top-1/2 left-0 w-full -translate-y-1/2"
        playsInline
        loop
        muted={muted}
        poster={poster}
        preload={preload ? "auto" : "none"}
        disablePictureInPicture
        onContextMenu={(event) => event.preventDefault()}
        onPlaying={() => {
          setShowPoster(false)
          onBufferingRef.current(false)
        }}
        onLoadedData={markReady}
        onCanPlay={() => {
          markReady()
          if (activeRef.current && !pausedRef.current) {
            void videoRef.current?.play().catch(() => {})
          }
        }}
        onWaiting={() => {
          if (activeRef.current && !pausedRef.current) onBufferingRef.current(true)
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget
          if (video.duration && Number.isFinite(video.duration)) {
            onProgressRef.current(video.currentTime / video.duration)
          }
          if (video.readyState >= 3) onBufferingRef.current(false)
        }}
        onEnded={(event) => {
          const video = event.currentTarget
          video.currentTime = 0
          if (activeRef.current && !pausedRef.current) void video.play().catch(() => {})
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
