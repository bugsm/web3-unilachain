import { useMemo, useState } from "react"
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router"
import { ChevronRight, Search } from "lucide-react"
import type { RecordFilter, RecordStatus } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { useAsync } from "@/app/useAsync"
import { CustodyBar } from "@/components/Custody"
import { Input, PageHeader, Select, StatusBadge, Tag, cx, td, th } from "@/components/ui"
import { LoadError } from "@/components/ui/LoadError"
import { formatDate } from "@/domain/format"
import { RecordDrawer, pendingTag } from "./RecordDrawer"

const TABS: Array<{ id: RecordFilter; label: string; match: (s: RecordStatus) => boolean }> = [
  { id: "ALL", label: "Semua", match: () => true },
  { id: "PENDING", label: "Dalam pengesahan", match: (s) => s === "MENUNGGU_DEKAN" || s === "MENUNGGU_REKTOR" },
  { id: "AKTIF", label: "Aktif", match: (s) => s === "AKTIF" },
  { id: "DICABUT", label: "Dicabut", match: (s) => s === "DICABUT" },
  { id: "DITOLAK", label: "Ditolak", match: (s) => s === "DITOLAK_DEKAN" || s === "DITOLAK_REKTOR" },
]

export function RegistryScreen() {
  const api = useApi()
  const navigate = useNavigate()
  const { search } = useLocation()
  const { npm } = useParams()
  const [params, setParams] = useSearchParams()
  const list = useAsync(() => api.listRecords(), [api])
  const [program, setProgram] = useState("")

  const filter = (TABS.find((t) => t.id === params.get("status"))?.id ?? "ALL") as RecordFilter
  const query = params.get("q") ?? ""
  const setParam = (k: string, v: string) =>
    setParams(
      (p) => {
        if (v) p.set(k, v)
        else p.delete(k)
        return p
      },
      { replace: true },
    )

  const records = useMemo(() => list.data ?? [], [list.data])
  const tab = TABS.find((t) => t.id === filter)!
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return records
      .filter((r) => tab.match(r.status))
      .filter((r) => !program || r.programStudy === program)
      .filter((r) => !q || `${r.name} ${r.npm} ${r.skpiId}`.toLowerCase().includes(q))
  }, [records, tab, program, query])
  const programs = useMemo(() => [...new Set(records.map((r) => r.programStudy))].sort(), [records])

  return (
    <>
      <PageHeader
        eyebrow="Aset ledger & draft"
        title="Daftar & riwayat SKPI"
        description="Seluruh SKPI dalam lingkup Anda: draft off-chain dan aset ledger beserta status terkini. Riwayat ledger diambil dari histori kunci NPM dan tidak dapat diubah."
      />

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Filter status">
          {TABS.map((t) => {
            const n = records.filter((r) => t.match(r.status)).length
            const active = t.id === filter
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => setParam("status", t.id === "ALL" ? "" : t.id)}
                className={cx(
                  // Tab: tanpa animasi indikator (sering dipakai); hanya warna.
                  "flex h-12 items-center gap-2 border-b-2 text-sm whitespace-nowrap transition-colors duration-150",
                  active ? "border-brand font-semibold text-ink" : "border-transparent text-slate-500 hover:text-ink",
                )}
              >
                {t.label}
                <span className={cx("rounded-md px-1.5 text-xs tabular-nums", active ? "bg-brand-soft text-brand" : "bg-slate-100 text-slate-500")}>
                  {list.data ? n : "–"}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      <div className="my-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="pointer-events-none absolute top-3 left-3 text-slate-400" />
          <Input
            aria-label="Cari SKPI"
            value={query}
            onChange={(e) => setParam("q", e.target.value)}
            placeholder="Cari nama, NPM, atau nomor SKPI"
            className="pl-9"
          />
        </div>
        <Select aria-label="Program studi" value={program} onChange={(e) => setProgram(e.target.value)} className="w-full sm:w-56">
          <option value="">Semua program studi</option>
          {programs.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
      </div>

      {list.error !== undefined && (
        <div className="mb-4">
          <LoadError error={list.error} onRetry={list.reload} />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-canvas">
              <tr>
                <th className={th}>Lulusan</th>
                <th className={th}>Nomor SKPI</th>
                <th className={cx(th, "text-right")}>Total SKP</th>
                <th className={th}>Waktu terbit</th>
                <th className={th}>Rantai pengesahan</th>
                <th className={th}>Status</th>
                <th className={th}>Aktivitas terakhir</th>
                <th className="w-10">
                  <span className="sr-only">Buka</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tag = pendingTag(r)
                return (
                  <tr
                    key={r.npm}
                    onClick={() => navigate({ pathname: `/daftar/${r.npm}`, search })}
                    className="cursor-pointer border-t border-line transition-colors duration-150 hover:bg-slate-50"
                  >
                    <td className={td}>
                      <p className="font-semibold text-ink">{r.name}</p>
                      <p className="font-mono text-xs text-slate-500 tabular-nums">
                        {r.npm} · {r.programStudy}
                      </p>
                    </td>
                    <td className={cx(td, "font-mono text-xs text-slate-700 tabular-nums")}>{r.skpiId}</td>
                    <td className={cx(td, "text-right")}>
                      <p className="font-mono text-ink tabular-nums">{r.totalSKP}</p>
                      <p className="text-xs text-slate-500">{r.predicate}</p>
                    </td>
                    <td className={cx(td, "text-slate-600 tabular-nums")}>{r.issuedTimestamp ? formatDate(r.issuedTimestamp) : "—"}</td>
                    <td className={td}>
                      <CustodyBar status={r.status} />
                    </td>
                    <td className={td}>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={r.status} />
                        {tag && <Tag tone={r.pendingDraft?.type === "PENCABUTAN" ? "revoked" : "pending"}>{tag}</Tag>}
                      </div>
                    </td>
                    <td className={cx(td, "text-xs text-slate-500 tabular-nums")}>{r.lastActivityAt ? formatDate(r.lastActivityAt) : "—"}</td>
                    <td className="pr-4 text-slate-400">
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {list.data && rows.length === 0 && <p className="px-6 py-16 text-center text-sm text-slate-500">Tidak ada SKPI yang cocok dengan filter.</p>}
        <div className="flex items-center justify-between border-t border-line bg-canvas px-4 py-3 text-xs text-slate-500">
          <span>
            Menampilkan <span className="tabular-nums">{rows.length}</span> dari <span className="tabular-nums">{records.length}</span> SKPI
          </span>
          <span className="hidden sm:inline">Klik baris untuk melihat riwayat</span>
        </div>
      </div>

      <RecordDrawer
        npm={npm ?? null}
        onClose={() => navigate({ pathname: "/daftar", search })}
        onChanged={list.reload}
      />
    </>
  )
}
