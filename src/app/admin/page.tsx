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
    <div className="admin-login">
      <div className="admin-login-card">
        <div className="flex flex-col items-center text-center">
          <BrandLogo className="h-14 w-14" />
          <p className="mt-4 text-[11px] font-medium tracking-[0.32em] text-white/40">SHUNKAN</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-white">管理后台</h1>
          <p className="mt-2 text-sm text-white/40">登录后管理用户、订单与系统配置</p>
        </div>

        {checking ? (
          <div className="mt-12 grid place-items-center pb-4">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        ) : (
          <form className="mt-8 space-y-3" onSubmit={(event) => void submit(event)}>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="管理账号"
              className="admin-field h-12 w-full"
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="密码"
              className="admin-field h-12 w-full"
            />
            {error && <p className="admin-alert-error !mt-1">{error}</p>}
            <button type="submit" disabled={pending} className="admin-btn admin-btn-primary mt-1 h-12 w-full">
              {pending ? "登录中…" : "进入控制台"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
