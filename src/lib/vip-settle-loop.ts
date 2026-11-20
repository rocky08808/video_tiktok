import { settlePendingVipOrdersFromChain } from "@/lib/auth"

const GLOBAL_KEY = "__sk_vip_settle_loop__"

type LoopState = {
  timer: ReturnType<typeof setInterval> | null
  running: boolean
}

function state(): LoopState {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: LoopState }
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { timer: null, running: false }
  return g[GLOBAL_KEY]
}

async function tick() {
  const s = state()
  if (s.running) return
  s.running = true
  try {
    await settlePendingVipOrdersFromChain({ force: true })
  } catch {
    // 查链失败下次再试，不打断进程
  } finally {
    s.running = false
  }
}

/** 随 Node 服务启动；不依赖宝塔 crontab */
export function startVipSettleLoop(intervalMs = 120_000) {
  if (process.env.VIP_SETTLE_LOOP === "0") return
  const s = state()
  if (s.timer) return
  const delay = Math.max(30_000, intervalMs)
  // 启动稍后跑一次，再按间隔轮询
  void tick()
  s.timer = setInterval(() => {
    void tick()
  }, delay)
  if (typeof s.timer.unref === "function") s.timer.unref()
}
