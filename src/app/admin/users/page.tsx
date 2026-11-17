"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

type UserRow = {
  username: string
  vip: boolean
  vipAt: string | null
  vipSource: string | null
  inviteCode: string | null
  invitedBy: string | null
  inviteCount: number
  inviteVipCount: number
  savedCount: number
  likedCount: number
  createdAt: string | null
}

type UsersResponse = {
  items?: UserRow[]
  total?: number
  page?: number
  pages?: number
  error?: string
}

function formatTime(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("zh-CN", { hour12: false })
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [adminName, setAdminName] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [query, setQuery] = useState("")
  const [vip, setVip] = useState<"all" | "yes" | "no">("all")
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [items, setItems] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        q: query,
        vip,
        page: String(page),
        pageSize: "20",
      })
      const response = await fetch(`/api/admin/users?${params}`)
      const data = (await response.json()) as UsersResponse
      if (response.status === 401) {
        router.replace("/admin")
        return
      }
      if (!response.ok) {
        setError(data.error || "加载失败")
        setItems([])
        return
      }
      setItems(Array.isArray(data.items) ? data.items : [])
      setTotal(data.total ?? 0)
      setPages(data.pages ?? 1)
    } catch {
      setError("网络不好，稍后再试")
    } finally {
      setLoading(false)
    }
  }, [page, query, router, vip])

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/admin/me", { signal: controller.signal })
      .then((response) => response.json() as Promise<{ username?: string | null }>)
      .then((data) => {
        if (!data.username) {
          router.replace("/admin")
          return
        }
        setAdminName(data.username)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        router.replace("/admin")
      })
    return () => controller.abort()
  }, [router])

  useEffect(() => {
    if (!adminName) return
    void loadUsers()
  }, [adminName, loadUsers])

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" })
    router.replace("/admin")
  }

  async function toggleVip(user: UserRow) {
    if (busy) return
    const next = !user.vip
    const tip = next ? `确认给 ${user.username} 开通 VIP？` : `确认取消 ${user.username} 的 VIP？`
    if (!window.confirm(tip)) return
    setBusy(user.username)
    setError(null)
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, vip: next }),
      })
      const data = (await response.json()) as { error?: string }
      if (response.status === 401) {
        router.replace("/admin")
        return
      }
      if (!response.ok) {
        setError(data.error || "操作失败")
        return
      }
      await loadUsers()
    } catch {
      setError("网络不好，稍后再试")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-[12px] tracking-[0.2em] text-white/35">瞬看 · ADMIN</p>
          <h1 className="mt-1 text-xl font-semibold">用户管理</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/55">
          <span>{adminName}</span>
          <Link href="/admin/settings" className="hover:text-white">
            系统配置
          </Link>
          <Link href="/" className="hover:text-white">
            回首页
          </Link>
          <button type="button" className="hover:text-white" onClick={() => void logout()}>
            退出
          </button>
        </div>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setPage(1)
              setQuery(q.trim())
            }
          }}
          placeholder="搜索用户名 / 邀请码"
          className="h-10 min-w-[220px] flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none placeholder:text-white/30 focus:border-white/25"
        />
        <select
          value={vip}
          onChange={(event) => {
            setPage(1)
            setVip(event.target.value as "all" | "yes" | "no")
          }}
          className="h-10 rounded-lg border border-white/10 bg-[#171a21] px-3 text-sm outline-none"
        >
          <option value="all">全部</option>
          <option value="yes">仅 VIP</option>
          <option value="no">非 VIP</option>
        </select>
        <button
          type="button"
          className="h-10 rounded-lg bg-white px-4 text-sm font-semibold text-black"
          onClick={() => {
            setPage(1)
            setQuery(q.trim())
          }}
        >
          搜索
        </button>
      </div>

      <p className="mt-3 text-sm text-white/40">共 {total} 人</p>
      {error && <p className="mt-2 text-sm text-[#ff7a96]">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-white/45">
            <tr>
              <th className="px-3 py-3 font-medium">用户</th>
              <th className="px-3 py-3 font-medium">VIP</th>
              <th className="px-3 py-3 font-medium">来源</th>
              <th className="px-3 py-3 font-medium">邀请</th>
              <th className="px-3 py-3 font-medium">收藏/赞</th>
              <th className="px-3 py-3 font-medium">注册时间</th>
              <th className="px-3 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-white/40">
                  加载中…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-white/40">
                  没有用户
                </td>
              </tr>
            ) : (
              items.map((user) => (
                <tr key={user.username} className="border-t border-white/10">
                  <td className="px-3 py-3">
                    <p className="font-medium text-white">{user.username}</p>
                    <p className="mt-0.5 text-[12px] text-white/35">
                      码 {user.inviteCode || "—"}
                      {user.invitedBy ? ` · 由 ${user.invitedBy}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {user.vip ? (
                      <span className="rounded-md bg-[#25f4ee]/15 px-2 py-0.5 text-[12px] font-semibold text-[#25f4ee]">
                        VIP
                      </span>
                    ) : (
                      <span className="text-white/35">普通</span>
                    )}
                    {user.vipAt && <p className="mt-1 text-[11px] text-white/30">{formatTime(user.vipAt)}</p>}
                  </td>
                  <td className="px-3 py-3 text-white/55">{user.vipSource || "—"}</td>
                  <td className="px-3 py-3 tabular-nums text-white/70">
                    {user.inviteCount} / VIP {user.inviteVipCount}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-white/55">
                    {user.savedCount} / {user.likedCount}
                  </td>
                  <td className="px-3 py-3 text-white/45">{formatTime(user.createdAt)}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      disabled={busy === user.username}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-white/80 disabled:opacity-50"
                      onClick={() => void toggleVip(user)}
                    >
                      {busy === user.username ? "处理中…" : user.vip ? "取消 VIP" : "开通 VIP"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm text-white/50">
        <button
          type="button"
          className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
          disabled={page <= 1 || loading}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          上一页
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          type="button"
          className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
          disabled={page >= pages || loading}
          onClick={() => setPage((current) => current + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  )
}
