export function rewritePlaylist(body: string, playlistUrl: string) {
  return body
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith("#")) {
        return line.replace(
          /URI="([^"]+)"/gi,
          (_match, uri: string) => `URI="${toProxy(uri, playlistUrl)}"`,
        )
      }
      return toProxy(trimmed, playlistUrl)
    })
    .join("\n")
}

function toProxy(uri: string, playlistUrl: string) {
  const absolute = new URL(uri, playlistUrl).toString()
  return `/api/hls?src=${encodeURIComponent(absolute)}`
}

export function isPlaylist(src: string, contentType: string) {
  const path = src.split("?")[0]?.toLowerCase() ?? ""
  return (
    path.endsWith(".m3u8") ||
    path.endsWith(".m3u") ||
    contentType.includes("mpegurl") ||
    contentType.includes("m3u8")
  )
}
