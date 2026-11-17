import { VIP_FREE_DAILY, VIP_INVITE_NEED, VIP_PIC_FREE } from "@/lib/vip"

export type AppSettings = {
  freeDailyVideos: number
  freeDailyPics: number
  inviteNeed: number
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  freeDailyVideos: VIP_FREE_DAILY,
  freeDailyPics: VIP_PIC_FREE,
  inviteNeed: VIP_INVITE_NEED,
}
