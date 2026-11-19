import { describeMongoError, getMoviesCollection, mongoUri } from "@/lib/mongo"
import { playbackSrc, publicBase, resolveSrc } from "@/lib/r2"

export const MOVIE_PAGE_SIZE = 40

export type MovieItem = {
  id: string
  title: string
  img?: string
  video: string
  likes: number
  bookmarks: number
}

export type MoviesPageResponse = {
  movies: MovieItem[]
  hasMore?: boolean
  error?: string
}

type RawMovie = {
  id?: string
  title?: string
  name?: string
  img?: string
  poster?: string
  video?: string
  src?: string
  m3u8?: string
  order?: number
  likes?: unknown
  bookmarks?: unknown
}

function countOf(value: unknown) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function mapMovies(inputs: RawMovie[], base: string): MovieItem[] {
  const movies: MovieItem[] = []
  for (const item of inputs) {
    if (!item) continue
    const rawSrc = String(item.video || item.src || item.m3u8 || "").trim()
    if (!rawSrc) continue
    const absolute = resolveSrc(rawSrc, base)
    if (!absolute) continue
    const title = String(item.title || item.name || "电影").trim() || "电影"
    const posterRaw = String(item.img || item.poster || "").trim()
    const poster = posterRaw ? resolveSrc(posterRaw, base) : null
    movies.push({
      id: String(item.id || absolute),
      title,
      img: poster || undefined,
      video: playbackSrc(absolute, base),
      likes: countOf(item.likes),
      bookmarks: countOf(item.bookmarks),
    })
  }
  return movies
}

export async function getMoviesByIds(ids: string[]): Promise<MoviesPageResponse> {
  const wanted = Array.from(
    new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)),
  ).slice(0, 200)
  if (wanted.length === 0) return { movies: [], hasMore: false }

  const envBase = publicBase()
  if (!mongoUri()) {
    return { movies: [], hasMore: false, error: "未配置数据库" }
  }

  try {
    const collection = await getMoviesCollection()
    const docs = (await collection.find({ id: { $in: wanted } }).toArray()) as RawMovie[]
    const mapped = mapMovies(docs, envBase)
    const byId = new Map(mapped.map((movie) => [movie.id, movie]))
    const movies = wanted.map((id) => byId.get(id)).filter((movie): movie is MovieItem => Boolean(movie))
    return { movies, hasMore: false }
  } catch (error) {
    return {
      movies: [],
      hasMore: false,
      error: describeMongoError(error),
    }
  }
}

export async function getMoviesPage(input?: {
  limit?: number
  offset?: number
}): Promise<MoviesPageResponse> {
  const limit = Math.min(100, Math.max(1, Math.round(Number(input?.limit) || MOVIE_PAGE_SIZE)))
  const offset = Math.max(0, Math.round(Number(input?.offset) || 0))
  const envBase = publicBase()

  if (!mongoUri()) {
    return { movies: [], hasMore: false, error: "未配置数据库" }
  }

  try {
    const collection = await getMoviesCollection()
    const filter = {
      $or: [{ video: { $gt: "" } }, { src: { $gt: "" } }, { m3u8: { $gt: "" } }],
    }
    const docs = (await collection
      .find(filter)
      .sort({ order: 1, _id: 1 })
      .skip(offset)
      .limit(limit)
      .toArray()) as RawMovie[]
    const movies = mapMovies(docs, envBase)
    if (docs.length > 0 && movies.length === 0) {
      return { movies: [], hasMore: false, error: "电影记录在，但播放地址无效" }
    }
    return {
      movies,
      hasMore: docs.length >= limit,
    }
  } catch (error) {
    return {
      movies: [],
      hasMore: false,
      error: describeMongoError(error),
    }
  }
}
