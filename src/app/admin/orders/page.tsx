"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { AdminShell } from "@/components/AdminShell"
import { useLocale, useT } from "@/components/LocaleProvider"

type OrderStatus = "pending" | "paid" | "cancelled" | "expired"

type OrderRow = {
  id: string
  username: string
  amount: number
  amountText: string
  currency: string
  network: string
  address: string | null
  status: OrderStatus
  txId: string | null
  from: string | null
  createdAt: string | null
  paidAt: string | null
}

type OrdersResponse = {
  items?: OrderRow[]
  total?: number
  page?: number
  pages?: number
  error?: string
}

function statusClass(status: OrderStatus) {
  if (status === "paid") return "bg-[#25f4ee]/15 text-[#25f4ee]"
  if (status === "cancelled") return "bg-white/10 text-white/45"
  if (status === "expired") return "bg-[#ff7a96]/12 text-[#ff7a96]"
  return "bg-[#fe2c55]/15 text-[#ff8aa3]"
}

export default function AdminOrdersPage() {
  const router = useRouter()
  const t = useT()
  const { locale } = useLocale()
  const [adminName, setAdminName] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | OrderStatus>("all")
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [items, setItems] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  function formatTime(value: string | null) {
    if (!value) return "—"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { hour12: false })
  }

  function statusLabel(value: OrderStatus) {
    if (value === "paid") return t("admin.statusPaid")
    if (value === "cancelled") return t("admin.statusCancelled")
    if (value === "expired") return t("admin.statusExpired")
    return t("admin.statusPending")
  }

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        q: query,
        status,
        page: String(page),
        pageSize: "20",
      })
      const response = await fetch(`/api/admin/orders?${params}`)
      const data = (await response.json()) as OrdersResponse
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
  }, [page, query, router, status, t])

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
    void loadOrders()
  }, [adminName, loadOrders])

  async function runAction(order: OrderRow, action: "cancel" | "markPaid" | "check") {
    if (busy) return
    if (action === "cancel") {
      if (
        !window.confirm(
          t("admin.confirmCancelOrder", { name: order.username, amount: order.amountText }),
        )
      ) {
        return
      }
    } else if (action === "markPaid") {
      if (
        !window.confirm(
          t("admin.confirmMarkPaid", { name: order.username, amount: order.amountText }),
        )
      ) {
        return
      }
    }
    setBusy(order.id)
    setError(null)
    setInfo(null)
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, action }),
      })
      const data = (await response.json()) as {
        error?: string
        found?: boolean
        message?: string
        txId?: string | null
      }
      if (response.status === 401) {
        router.replace("/admin")
        return
      }
      if (!response.ok) {
        setError(data.error || t("admin.actionFailed"))
        return
      }
      if (action === "check") {
        if (data.found) {
          setInfo(
            data.message ||
              (data.txId
                ? t("admin.paidDetectedTx", { tx: data.txId })
                : t("admin.paidDetected")),
          )
        } else {
          setInfo(data.message || t("admin.notDetected"))
        }
      } else {
        setInfo(action === "markPaid" ? t("admin.markedPaid") : t("admin.orderCancelled"))
      }
      await loadOrders()
    } catch {
      setError(t("admin.network"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <AdminShell title={t("admin.ordersTitle")} description={t("admin.ordersDesc")} adminName={adminName}>
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
          placeholder={t("admin.ordersSearch")}
          className="admin-field min-w-[220px] flex-1"
        />
        <select
          value={status}
          onChange={(event) => {
            setPage(1)
            setStatus(event.target.value as "all" | OrderStatus)
          }}
          className="admin-field"
        >
          <option value="all">{t("admin.ordersAll")}</option>
          <option value="pending">{t("admin.statusPending")}</option>
          <option value="paid">{t("admin.statusPaid")}</option>
          <option value="expired">{t("admin.statusExpired")}</option>
          <option value="cancelled">{t("admin.statusCancelled")}</option>
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

      <p className="admin-meta">{t("admin.ordersTotal", { n: total })}</p>
      {error && <p className="admin-alert-error">{error}</p>}
      {info && <p className="admin-alert-ok">{info}</p>}

      <div className="admin-panel mt-4 overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("admin.colUserAmount")}</th>
              <th>{t("admin.colStatus")}</th>
              <th>{t("admin.colChain")}</th>
              <th>{t("admin.colTime")}</th>
              <th>{t("admin.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="!py-12 text-center text-white/40">
                  {t("admin.loading")}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="!py-12 text-center text-white/40">
                  {t("admin.ordersEmpty")}
                </td>
              </tr>
            ) : (
              items.map((order) => (
                <tr key={order.id}>
                  <td>
                    <p className="font-medium text-white">{order.username}</p>
                    <p className="mt-0.5 tabular-nums text-[13px] text-white/70">
                      {order.amountText} {order.currency}
                      <span className="ml-1 text-white/35">{order.network}</span>
                    </p>
                    <p className="mt-0.5 break-all font-mono text-[11px] text-white/30">{order.id}</p>
                  </td>
                  <td>
                    <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${statusClass(order.status)}`}>
                      {statusLabel(order.status)}
                    </span>
                  </td>
                  <td>
                    <p className="break-all font-mono text-[12px] text-white/55">{order.txId || "—"}</p>
                    <p className="mt-0.5 break-all font-mono text-[11px] text-white/30">
                      {order.from ? `from ${order.from}` : order.address ? `to ${order.address}` : "—"}
                    </p>
                  </td>
                  <td className="text-white/45">
                    <p>{formatTime(order.createdAt)}</p>
                    {order.paidAt && (
                      <p className="mt-0.5 text-[11px] text-white/30">
                        {t("admin.paidAt", { time: formatTime(order.paidAt) })}
                      </p>
                    )}
                  </td>
                  <td>
                    {(order.status === "pending" || order.status === "expired") && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy === order.id}
                          className="admin-btn admin-btn-mint !h-8 !px-3 !text-[12px]"
                          onClick={() => void runAction(order, "check")}
                        >
                          {busy === order.id ? t("admin.checking") : t("admin.checkPayment")}
                        </button>
                        <button
                          type="button"
                          disabled={busy === order.id}
                          className="admin-btn !h-8 !px-3 !text-[12px] border border-white/70 bg-white/90 text-[#140c12]"
                          onClick={() => void runAction(order, "markPaid")}
                        >
                          {t("admin.markPaid")}
                        </button>
                        <button
                          type="button"
                          disabled={busy === order.id}
                          className="admin-btn !h-8 !px-3 !text-[12px] border border-[#ff7a96]/40 bg-[#ff7a96]/10 text-[#ff8aa3]"
                          onClick={() => void runAction(order, "cancel")}
                        >
                          {t("admin.cancel")}
                        </button>
                      </div>
                    )}
                    {order.status !== "pending" && order.status !== "expired" && (
                      <span className="text-[12px] text-white/30">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
