"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { AdminShell } from "@/components/AdminShell"
import { useLocale, useT } from "@/components/LocaleProvider"

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

export default function AdminUsersPage() {
  const router = useRouter()
  const t = useT()
  const { locale } = useLocale()
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

  function formatTime(value: string | null) {
    if (!value) return "—"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { hour12: false })
  }

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
        setError(data.error || t("admin.loadFailed"))
        setItems([])
        return
      }
      setItems(Array.isArray(data.items) ? data.items : [])
      setTotal(data.total ?? 0)
      setPages(data.pages ?? 1)
    } catch {
      setError(t("admin.network"))
    } finally {
      setLoading(false)
    }
  }, [page, query, router, t, vip])

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
      setPwdError(t("admin.pwdTooShort"))
      return
    }
    if (pwd !== pwd2) {
      setPwdError(t("admin.pwdMismatch"))
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
        setPwdError(data.error || t("admin.pwdFailed"))
        return
      }
      setInfo(t("admin.pwdUpdated", { name: pwdUser }))
      setPwdUser(null)
      setPwd("")
      setPwd2("")
    } catch {
      setPwdError(t("admin.network"))
    } finally {
      setBusy(null)
    }
  }

  async function toggleVip(user: UserRow) {
    if (busy) return
    const next = !user.vip
    const tip = next
      ? t("admin.confirmGrantVip", { name: user.username })
      : t("admin.confirmRevokeVip", { name: user.username })
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
        setError(data.error || t("admin.actionFailed"))
        return
      }
      await loadUsers()
    } catch {
      setError(t("admin.network"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <AdminShell title={t("admin.usersTitle")} description={t("admin.usersDesc")} adminName={adminName}>
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
          placeholder={t("admin.usersSearch")}
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
          <option value="all">{t("admin.usersAll")}</option>
          <option value="yes">{t("admin.usersVipOnly")}</option>
          <option value="no">{t("admin.usersNonVip")}</option>
        </select>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={() => {
            setPage(1)
            setQuery(q.trim())
          }}
        >
          {t("admin.search")}
        </button>
      </div>

      <p className="admin-meta">{t("admin.usersTotal", { n: total })}</p>
      {error && <p className="admin-alert-error">{error}</p>}
      {info && <p className="admin-alert-ok">{info}</p>}

      <div className="admin-panel mt-4 overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("admin.colUser")}</th>
              <th>{t("admin.colVip")}</th>
              <th>{t("admin.colSource")}</th>
              <th>{t("admin.colInvite")}</th>
              <th>{t("admin.colSavedLiked")}</th>
              <th>{t("admin.colCreated")}</th>
              <th>{t("admin.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="!py-12 text-center text-white/40">
                  {t("admin.loading")}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="!py-12 text-center text-white/40">
                  {t("admin.usersEmpty")}
                </td>
              </tr>
            ) : (
              items.map((user) => (
                <tr key={user.username}>
                  <td>
                    <p className="font-medium text-white">{user.username}</p>
                    <p className="mt-0.5 text-[12px] text-white/35">
                      {t("admin.codeBy", { code: user.inviteCode || "—" })}
                      {user.invitedBy ? t("admin.invitedBy", { name: user.invitedBy }) : ""}
                    </p>
                  </td>
                  <td>
                    {user.vip ? (
                      <span className="rounded-md bg-[#25f4ee]/15 px-2 py-0.5 text-[12px] font-semibold text-[#25f4ee]">
                        VIP
                      </span>
                    ) : (
                      <span className="text-white/35">{t("admin.freeUser")}</span>
                    )}
                    {user.vipUntil ? (
                      <p className="mt-1 text-[11px] text-white/30">
                        {t("admin.until", { time: formatTime(user.vipUntil) })}
                      </p>
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
                        {t("admin.changePassword")}
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
                        {busy === user.username
                          ? t("admin.processing")
                          : user.vip
                            ? t("admin.revokeVip")
                            : t("admin.grantVip")}
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
            <p className="text-[15px] font-semibold text-white">{t("admin.pwdTitle")}</p>
            <p className="mt-1 text-[12px] text-white/40">{t("admin.pwdUser", { name: pwdUser })}</p>
            <div className="mt-4 space-y-3">
              <input
                type="password"
                value={pwd}
                onChange={(event) => setPwd(event.target.value)}
                placeholder={t("admin.pwdNew")}
                className="admin-field h-11 w-full"
                autoComplete="new-password"
              />
              <input
                type="password"
                value={pwd2}
                onChange={(event) => setPwd2(event.target.value)}
                placeholder={t("admin.pwdAgain")}
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
                {t("admin.cancel")}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={busy === `pwd:${pwdUser}`}
                onClick={() => void submitPassword()}
              >
                {busy === `pwd:${pwdUser}` ? t("admin.saving") : t("admin.save")}
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
          {t("admin.prevPage")}
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
          {t("admin.nextPage")}
        </button>
      </div>
    </AdminShell>
  )
}
