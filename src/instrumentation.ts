export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  // next build 阶段不要挂轮询
  if (process.env.NEXT_PHASE === "phase-production-build") return

  const { startVipSettleLoop } = await import("@/lib/vip-settle-loop")
  startVipSettleLoop()
}
