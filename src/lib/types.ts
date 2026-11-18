export type VideoItem = {
  id: string
  author: string
  handle: string
  description: string
  music: string
  likes: number
  comments: number
  shares: number
  bookmarks: number
  src: string
  poster?: string
  avatar?: string
  following?: boolean
}

export type VideoFeedResponse = {
  videos: VideoItem[]
  mode: "r2" | "demo"
  base?: string
  error?: string
  hasMore?: boolean
}
