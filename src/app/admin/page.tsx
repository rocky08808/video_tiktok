"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"
import { BrandLogo } from "@/components/BrandLogo"

export default function AdminLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/admin/me", { signal: controller.signal })
      .then((response) => response.json() as Promise<{ username?: string | null; configured?: boolean; error?: string }>)
      .then((data) => {
        if (data.username) {
          router.replace("/admin/users")
          return
        }
        if (data.configured === false) setError(data.error || "还没配置管理账号")
        setChecking(false)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setError("网络不好，稍后再试")
        setChecking(false)
      })
    return () => controller.abort()
  }, [router])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = (await response.json()) as { username?: string; error?: string }
      if (!response.ok || !data.username) {
        setError(data.error || "登录失败")
        return
      }
      router.replace("/admin/users")
    } catch {
      setError("网络不好，稍后再试")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="flex flex-col items-center gap-2.5">
        <BrandLogo className="h-12 w-12" />
        <p className="text-[12px] font-medium tracking-[0.28em] text-white/35">瞬看</p>
      </div>
      <h1 className="mt-3 text-center text-2xl font-semibold tracking-tight">管理后台</h1>
      <p className="mt-2 text-center text-sm text-white/45">使用管理账号登录</p>

      {checking ? (
        <div className="mt-16 grid place-items-center">
          <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      ) : (
        <form className="mt-10 space-y-3" onSubmit={(event) => void submit(event)}>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="管理账号"
            className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm outline-none placeholder:text-white/30 focus:border-white/25"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="密码"
            className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm outline-none placeholder:text-white/30 focus:border-white/25"
          />
          {error && <p className="text-sm text-[#ff7a96]">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="h-12 w-full rounded-xl bg-white text-sm font-semibold text-black disabled:opacity-60"
          >
            {pending ? "登录中…" : "登录"}
          </button>
        </form>
      )}
    </div>
  )
}
