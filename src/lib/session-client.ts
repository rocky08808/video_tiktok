export const SESSION_KICKED_EVENT = "sk:session-kicked"

export function emitSessionKicked() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(SESSION_KICKED_EVENT))
}

/** 用到登录态的接口返回后调用：被顶号或 401 时通知 UI */
export function noteAuthResponse(response: Response, body?: { kicked?: boolean; username?: string | null }) {
  if (body?.kicked) {
    emitSessionKicked()
    return true
  }
  if (response.status === 401) {
    emitSessionKicked()
    return true
  }
  return false
}
