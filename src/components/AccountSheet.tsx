"use client"

import { useState, type FormEvent } from "react"

type User = { username: string }

export function AccountSheet({
  open,
  user,
  savedCount,
  onClose,
  onUser,
}: {
  open: boolean
  user: User | null
  savedCount: number
  onClose: () => void
  onUser: (user: User | null) => void
}) {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = (await response.json()) as { username?: string; error?: string }
      if (!response.ok || !data.username) {
        setError(data.error || "登录失败")
        return
      }
      setPassword("")
      onUser({ username: data.username })
    } catch {
      setError("网络不好，稍后再试")
    } finally {
      setPending(false)
    }
  }

  async function logout() {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" })
      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        setError(data.error || "退出失败")
        return
      }
      onUser(null)
      setMode("login")
      setPassword("")
    } catch {
      setError("网络不好，稍后再试")
    } finally {
      setPending(false)
    }
  }

  return (
    <div inert={!open} className={`absolute inset-0 z-40 ${open ? "" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label="关闭个人中心"
        className={`absolute inset-0 bg-black/45 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <section
        className={`absolute inset-x-0 bottom-0 rounded-t-2xl bg-[#161018] px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] text-white shadow-2xl transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!open}
      >
        <header className="relative grid place-items-center pb-4 pt-1">
          <span className="absolute top-0 h-1 w-10 rounded-full bg-white/20" />
          {user && (
            <button
              type="button"
              className="absolute left-0 top-2 h-8 px-1 text-sm text-white/80 disabled:opacity-60"
              onClick={() => void logout()}
              disabled={pending}
            >
              退出
            </button>
          )}
          <h2 className="pt-3 text-sm font-medium">个人中心</h2>
          <button
            type="button"
            className="absolute right-0 top-2 grid h-8 w-8 place-items-center text-white/70"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        {user ? (
          <div className="flex flex-col items-center pb-2">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-2xl font-semibold text-white">
              {Array.from(user.username)[0]}
            </span>
            <p className="mt-3 text-lg font-semibold">{user.username}</p>
            <p className="mt-1 text-sm text-white/55">收藏了 {savedCount} 条</p>
            {error && <p className="mt-3 text-sm text-[var(--dy)]">{error}</p>}
            <button
              type="button"
              className="mt-5 h-11 w-full rounded-full border border-white/25 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void logout()}
              disabled={pending}
            >
              {pending ? "退出中" : "退出"}
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-3 pb-1" onSubmit={(event) => void submit(event)}>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="用户名"
              className="h-11 rounded-full bg-white/10 px-4 text-sm outline-none placeholder:text-white/35"
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="密码"
              className="h-11 rounded-full bg-white/10 px-4 text-sm outline-none placeholder:text-white/35"
            />
            {error && <p className="text-sm text-[var(--dy)]">{error}</p>}
            <button
              type="submit"
              className="h-11 rounded-full bg-gradient-to-r from-[#fe2c55] via-[#7c5cff] to-[#25f4ee] text-sm font-semibold text-white disabled:opacity-60"
              disabled={pending}
            >
              {pending ? "请稍候" : mode === "login" ? "登录" : "注册"}
            </button>
            <button
              type="button"
              className="pb-1 text-sm text-white/60"
              onClick={() => {
                setMode((current) => (current === "login" ? "register" : "login"))
                setError(null)
              }}
            >
              {mode === "login" ? "没有账号？去注册" : "已有账号？去登录"}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
