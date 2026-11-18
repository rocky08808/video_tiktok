"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { AdminShell } from "@/components/AdminShell"

type UserRow = {
  username: string
  vip: boolean
  vipAt: string | null
  vipUntil: string | null
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
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pwdUser, setPwdUser] = useState<string | null>(null)
  const [pwd, setPwd] = useState("")
  const [pwd2, setPwd2] = useState("")
  const [pwdError, setPwdError] = useState<string | null>(null)

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

  function openPassword(user: UserRow) {
    setPwdUser(user.username)
    setPwd("")
    setPwd2("")
    setPwdError(null)
  }

  function closePassword() {
    if (busy) return
    setPwdUser(null)
    setPwd("")
    setPwd2("")
    setPwdError(null)
  }

  async function submitPassword() {
    if (!pwdUser || busy) return
    if (pwd.length < 6) {
      setPwdError("密码至少 6 位")
      return
    }
    if (pwd !== pwd2) {
      setPwdError("两次密码不一致")
      return
    }
    setBusy(`pwd:${pwdUser}`)
    setPwdError(null)
    setError(null)
    setInfo(null)
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: pwdUser, password: pwd }),
      })
      const data = (await response.json()) as { error?: string }
      if (response.status === 401) {
        router.replace("/admin")
        return
      }
      if (!response.ok) {
        setPwdError(data.error || "修改失败")
        return
      }
      setInfo(`已更新 ${pwdUser} 的密码`)
      setPwdUser(null)
      setPwd("")
      setPwd2("")
    } catch {
      setPwdError("网络不好，稍后再试")
    } finally {
      setBusy(null)
    }
  }

  async function toggleVip(user: UserRow) {
    if (busy) return
    const next = !user.vip
    const tip = next ? `确认给 ${user.username} 开通 VIP？` : `确认取消 ${user.username} 的 VIP？`
    if (!window.confirm(tip)) return
    setBusy(user.username)
    setError(null)
    setInfo(null)
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
    <AdminShell title="用户管理" description="查看账号、邀请关系，并开通或取消 VIP" adminName={adminName}>
      <div className="admin-toolbar">
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
          className="admin-field min-w-[220px] flex-1"
        />
        <select
          value={vip}
          onChange={(event) => {
            setPage(1)
            setVip(event.target.value as "all" | "yes" | "no")
          }}
          className="admin-field"
        >
          <option value="all">全部用户</option>
          <option value="yes">仅 VIP</option>
          <option value="no">非 VIP</option>
        </select>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={() => {
            setPage(1)
            setQuery(q.trim())
          }}
        >
          搜索
        </button>
      </div>

      <p className="admin-meta">共 {total} 人</p>
      {error && <p className="admin-alert-error">{error}</p>}
      {info && <p className="admin-alert-ok">{info}</p>}

      <div className="admin-panel mt-4 overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>用户</th>
              <th>VIP</th>
              <th>来源</th>
              <th>邀请</th>
              <th>收藏 / 赞</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="!py-12 text-center text-white/40">
                  加载中…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="!py-12 text-center text-white/40">
                  没有用户
                </td>
              </tr>
            ) : (
              items.map((user) => (
                <tr key={user.username}>
                  <td>
                    <p className="font-medium text-white">{user.username}</p>
                    <p className="mt-0.5 text-[12px] text-white/35">
                      码 {user.inviteCode || "—"}
                      {user.invitedBy ? ` · 由 ${user.invitedBy}` : ""}
                    </p>
                  </td>
                  <td>
                    {user.vip ? (
                      <span className="rounded-md bg-[#25f4ee]/15 px-2 py-0.5 text-[12px] font-semibold text-[#25f4ee]">
                        VIP
                      </span>
                    ) : (
                      <span className="text-white/35">普通</span>
                    )}
                    {user.vipUntil ? (
                      <p className="mt-1 text-[11px] text-white/30">至 {formatTime(user.vipUntil)}</p>
                    ) : user.vipAt ? (
                      <p className="mt-1 text-[11px] text-white/30">{formatTime(user.vipAt)}</p>
                    ) : null}
                  </td>
                  <td className="text-white/55">{user.vipSource || "—"}</td>
                  <td className="tabular-nums text-white/70">
                    {user.inviteCount} / VIP {user.inviteVipCount}
                  </td>
                  <td className="tabular-nums text-white/55">
                    {user.savedCount} / {user.likedCount}
                  </td>
                  <td className="text-white/45">{formatTime(user.createdAt)}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!!busy}
                        className="admin-btn admin-btn-ghost !h-8 !px-3 !text-[12px]"
                        onClick={() => openPassword(user)}
                      >
                        修改密码
                      </button>
                      <button
                        type="button"
                        disabled={busy === user.username}
                        className={`admin-btn !h-8 !px-3 !text-[12px] ${
                          user.vip
                            ? "border border-[#ff7a96]/40 bg-[#ff7a96]/10 text-[#ff8aa3]"
                            : "border border-[#25f4ee]/40 bg-[#25f4ee]/10 text-[#25f4ee]"
                        }`}
                        onClick={() => void toggleVip(user)}
                      >
                        {busy === user.username ? "处理中…" : user.vip ? "取消 VIP" : "开通 VIP"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pwdUser && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="admin-card w-full max-w-sm shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
            <p className="text-[15px] font-semibold text-white">修改密码</p>
            <p className="mt-1 text-[12px] text-white/40">用户 {pwdUser}</p>
            <div className="mt-4 space-y-3">
              <input
                type="password"
                value={pwd}
                onChange={(event) => setPwd(event.target.value)}
                placeholder="新密码（至少 6 位）"
                className="admin-field h-11 w-full"
                autoComplete="new-password"
              />
              <input
                type="password"
                value={pwd2}
                onChange={(event) => setPwd2(event.target.value)}
                placeholder="再输入一次"
                className="admin-field h-11 w-full"
                autoComplete="new-password"
              />
              {pwdError && <p className="admin-alert-error !mt-0">{pwdError}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                disabled={busy === `pwd:${pwdUser}`}
                onClick={closePassword}
              >
                取消
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={busy === `pwd:${pwdUser}`}
                onClick={() => void submitPassword()}
              >
                {busy === `pwd:${pwdUser}` ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-pager">
        <button
          type="button"
          className="admin-btn admin-btn-ghost"
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
          className="admin-btn admin-btn-ghost"
          disabled={page >= pages || loading}
          onClick={() => setPage((current) => current + 1)}
        >
          下一页
        </button>
      </div>
    </AdminShell>
  )
}
