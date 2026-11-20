type WebkitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void
  webkitExitFullscreen?: () => void
  webkitDisplayingFullscreen?: boolean
  webkitSupportsFullscreen?: boolean
}

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

type WebkitElement = Element & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

function webkitDoc() {
  return document as WebkitDocument
}

function findFullscreenVideo(target: Element): WebkitVideo | null {
  if (target instanceof HTMLVideoElement) return target as WebkitVideo
  const videos = Array.from(target.querySelectorAll("video")) as WebkitVideo[]
  if (videos.length === 0) return null
  const playing = videos.find((video) => !video.paused && !video.ended)
  if (playing) return playing
  return [...videos].sort((a, b) => b.readyState - a.readyState)[0] ?? null
}

export function getFullscreenElement(): Element | null {
  return document.fullscreenElement ?? webkitDoc().webkitFullscreenElement ?? null
}

export function isFullscreenFor(target: Element | null): boolean {
  if (!target) return false
  if (getFullscreenElement() === target) return true
  const video = findFullscreenVideo(target)
  if (video?.webkitDisplayingFullscreen) return true
  return false
}

async function enterVideoWebkitFullscreen(video: WebkitVideo): Promise<void> {
  if (video.webkitDisplayingFullscreen) return
  if (typeof video.webkitEnterFullscreen !== "function") {
    throw new Error("fullscreen unsupported")
  }

  if (video.readyState < 1) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup()
        reject(new Error("video not ready"))
      }, 4000)
      const onMeta = () => {
        cleanup()
        resolve()
      }
      const onErr = () => {
        cleanup()
        reject(new Error("video error"))
      }
      const cleanup = () => {
        window.clearTimeout(timer)
        video.removeEventListener("loadedmetadata", onMeta)
        video.removeEventListener("error", onErr)
      }
      video.addEventListener("loadedmetadata", onMeta)
      video.addEventListener("error", onErr)
    }).catch(() => {})
  }

  // iOS 在未播放时调用可能失败，先尽量起播（仍在用户手势栈内）
  if (video.paused) {
    await video.play().catch(() => {})
  }

  video.webkitEnterFullscreen()
}

export async function exitFullscreen(target?: Element | null): Promise<void> {
  const root = target ?? document.body
  const video = findFullscreenVideo(root)
  if (video?.webkitDisplayingFullscreen && typeof video.webkitExitFullscreen === "function") {
    try {
      video.webkitExitFullscreen()
      return
    } catch {
      // fall through
    }
  }

  const doc = webkitDoc()
  if (document.fullscreenElement && document.exitFullscreen) {
    await document.exitFullscreen()
    return
  }
  if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen()
  }
}

/** 标准 Fullscreen API；iPhone 上对容器无效，回退到 video.webkitEnterFullscreen */
export async function requestFullscreen(target: Element): Promise<void> {
  const el = target as WebkitElement
  if (typeof el.requestFullscreen === "function") {
    try {
      await el.requestFullscreen()
      return
    } catch {
      // iPhone / 权限拒绝 → 视频原生全屏
    }
  }
  if (typeof el.webkitRequestFullscreen === "function") {
    try {
      await el.webkitRequestFullscreen()
      return
    } catch {
      // fall through
    }
  }

  const video = findFullscreenVideo(target)
  if (!video) throw new Error("no video for fullscreen")
  await enterVideoWebkitFullscreen(video)
}

export function subscribeFullscreenChange(
  target: Element | null,
  onChange: () => void,
): () => void {
  document.addEventListener("fullscreenchange", onChange)
  document.addEventListener("webkitfullscreenchange", onChange)

  const capture = (event: Event) => {
    if (!(event.target instanceof HTMLVideoElement)) return
    if (target && !target.contains(event.target)) return
    onChange()
  }
  document.addEventListener("webkitbeginfullscreen", capture, true)
  document.addEventListener("webkitendfullscreen", capture, true)

  return () => {
    document.removeEventListener("fullscreenchange", onChange)
    document.removeEventListener("webkitfullscreenchange", onChange)
    document.removeEventListener("webkitbeginfullscreen", capture, true)
    document.removeEventListener("webkitendfullscreen", capture, true)
  }
}
