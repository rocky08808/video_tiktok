import { VIP_FREE_DAILY, VIP_INVITE_NEED, VIP_PIC_FREE, VIP_PRICE_USDT } from "@/lib/vip"

export type AppSettings = {
  freeDailyVideos: number
  freeDailyPics: number
  /** 普通用户每天可看电影部数 */
  freeDailyMovies: number
  inviteNeed: number
  vipPriceUsdt: number
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  freeDailyVideos: VIP_FREE_DAILY,
  freeDailyPics: VIP_PIC_FREE,
  freeDailyMovies: 3,
  inviteNeed: VIP_INVITE_NEED,
  vipPriceUsdt: VIP_PRICE_USDT,
}
