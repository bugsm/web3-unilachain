import { useId } from "react"
import { useNavigate } from "react-router"
import { ArrowRight, ChevronRight, FilePlus2, Inbox } from "lucide-react"
import type { RecordFilter, RecordStatus, Role, SkpiRecord } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { useUser } from "@/app/session"
import { useAsync } from "@/app/useAsync"
import { CustodyBar } from "@/components/Custody"
import { Badge, Hash, LinkButton, PageHeader, SectionTitle, StatusBadge, Tag, cx, td, th } from "@/components/ui"
import { LoadError } from "@/components/ui/LoadError"
import { formatDate, formatDateTime, formatTime } from "@/domain/format"
import { ACTION_LABEL, DRAFT_TYPE_LABEL } from "@/domain/status"

const FLOW: Array<{ status: RecordStatus; hint: string }> = [
  { status: "MENUNGGU_DEKAN", hint: "Menunggu tanda tangan fakultas" },
  { status: "MENUNGGU_REKTOR", hint: "Menunggu tanda tangan universitas" },
  { status: "AKTIF", hint: "Dapat diverifikasi publik" },
]

const MY_STAGE: Record<Role, RecordStatus | null> = {
  admin: null,
  dekan: "MENUNGGU_DEKAN",
  rektor: "MENUNGGU_REKTOR",
}

const DESCRIPTION: Record<Role, string> = {
  admin: "Ajukan draft SKPI lulusan fakultas Anda, lalu pantau pengesahannya oleh Dekan dan Rektor.",
  dekan: "Draft SKPI dari admin fakultas menunggu keputusan Anda. Persetujuan Anda dikirim sebagai transaksi ke ledger.",
  rektor: "Tanda tangan Anda adalah tahap terakhir sebelum SKPI dari seluruh fakultas aktif dan dapat diverifikasi publik.",
}

const toFilter = (s: RecordStatus): RecordFilter =>
  s === "MENUNGGU_DEKAN" || s === "MENUNGGU_REKTOR"
    ? "PENDING"
    : s === "DITOLAK_DEKAN" || s === "DITOLAK_REKTOR"
      ? "DITOLAK"
      : s

interface Row {
  record: SkpiRecord
  tag?: string
  since: string
}

export function Overview() {
  const user = useUser()
  const api = useApi()
  const navigate = useNavigate()
  const ids = { table: useId(), feed: useId() }
  const isAdmin = user.role === "admin"

  const data = useAsync(
    () =>
      Promise.all([
        api.listRecords(),
        isAdmin ? Promise.resolve([]) : api.listQueue(),
        api.activity(7),
      ]).then(([records, queue, activity]) => ({ records, queue, activity })),
    [api, isAdmin],
  )
  const records = data.data?.records ?? []
  const count = (...s: RecordStatus[]) => (data.data ? records.filter((r) => s.includes(r.status)).length : "–")
  const stage = MY_STAGE[user.role]

  const rows: Row[] = isAdmin
    ? records
        .filter((r) => r.status === "DITOLAK_DEKAN" || r.status === "DITOLAK_REKTOR")
        .map((record) => ({ record, since: record.lastActivityAt }))
    : (data.data?.queue ?? []).flatMap((q) =>
        q.kind === "rektor"
          ? [{ record: q.record, since: q.record.lastActivityAt }]
          : q.record
            ? [{ record: q.record, tag: DRAFT_TYPE_LABEL[q.draft.type], since: q.draft.updatedAt }]
            : [],
      )
  const tableTitle = isAdmin ? "Ditolak · perlu perbaikan" : "Menunggu tanda tangan Anda"
  const open = (npm: string) => navigate(isAdmin ? `/daftar/${npm}` : `/antrean?tinjau=${npm}`)
  const toList = (s: RecordStatus) => navigate(`/daftar?status=${toFilter(s)}`)

  return (
    <>
      <PageHeader
        eyebrow="Ikhtisar"
        title={user.name}
        description={DESCRIPTION[user.role]}
        actions={
          isAdmin ? (
            <LinkButton to="/catat" variant="primary">
              <FilePlus2 size={17} /> Catat SKPI
            </LinkButton>
          ) : (
            <LinkButton to="/antrean" variant="primary">
              <Inbox size={17} /> Buka antrean ({data.data ? rows.length : "–"})
            </LinkButton>
          )
        }
      />

      {data.error !== undefined && (
        <div className="mb-6">
          <LoadError error={data.error} onRetry={data.reload} />
        </div>
      )}

      <section aria-label="Status SKPI per tahap" className="grid grid-cols-12 overflow-hidden rounded-xl border border-slate-200">
        <div className="col-span-12 grid grid-cols-1 sm:grid-cols-3 lg:col-span-9">
          {FLOW.map((f, i) => {
            const mine = f.status === stage
            return (
              <button
                key={f.status}
                type="button"
                onClick={() => toList(f.status)}
                className={cx(
                  "relative flex min-h-36 flex-col items-start px-6 py-6 text-left transition-colors duration-150 hover:bg-slate-50 sm:min-h-48",
                  i > 0 && "border-t border-slate-200 sm:border-t-0 sm:border-l",
                  mine && "bg-[#F8FAFC]",
                )}
              >
                {mine && <span className="absolute inset-x-0 top-0 h-0.5 bg-[#1D4ED8]" />}
                <span className="flex w-full flex-wrap items-center justify-between gap-2">
                  <StatusBadge status={f.status} />
                  {mine && <span className="text-xs font-semibold text-[#1D4ED8]">Tahap Anda</span>}
                </span>
                {/* Angka fungsional: tanpa animasi. */}
                <span className="mt-auto pt-8 text-[52px] leading-none font-semibold tracking-[-0.04em] text-slate-900 tabular-nums">
                  {count(f.status)}
                </span>
                <span className="mt-2 text-sm text-slate-500">{f.hint}</span>
                {i < FLOW.length - 1 && (
                  <span className="absolute top-1/2 -right-3 z-10 hidden size-6 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-400 sm:grid">
                    <ChevronRight size={14} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="col-span-12 grid grid-cols-2 border-t border-slate-200 bg-[#F8FAFC] lg:col-span-3 lg:grid-cols-1 lg:border-t-0 lg:border-l">
          <button
            type="button"
            onClick={() => toList("DICABUT")}
            className="flex items-center justify-between gap-4 px-6 py-5 text-left transition-colors duration-150 hover:bg-slate-100"
          >
            <span>
              <StatusBadge status="DICABUT" />
              <span className="mt-2 block text-xs text-slate-500">Tidak lagi sah</span>
            </span>
            <span className="text-[28px] font-semibold tracking-tight text-slate-700 tabular-nums">{count("DICABUT")}</span>
          </button>
          <button
            type="button"
            onClick={() => toList("DITOLAK_DEKAN")}
            className="flex items-center justify-between gap-4 border-l border-slate-200 px-6 py-5 text-left transition-colors duration-150 hover:bg-slate-100 lg:border-t lg:border-l-0"
          >
            <span>
              <Badge tone="muted">Ditolak</Badge>
              <span className="mt-2 block text-xs text-slate-500">Ditolak Dekan atau Rektor</span>
            </span>
            <span className="text-[28px] font-semibold tracking-tight text-slate-700 tabular-nums">
              {count("DITOLAK_DEKAN", "DITOLAK_REKTOR")}
            </span>
          </button>
        </div>
      </section>

      <div className="mt-8 grid grid-cols-12 gap-6">
        <section aria-labelledby={ids.table} className="col-span-12 overflow-hidden rounded-xl border border-slate-200 lg:col-span-8">
          <SectionTitle
            id={ids.table}
            title={tableTitle}
            aside={
              <LinkButton variant="ghost" size="sm" to={isAdmin ? "/daftar?status=DITOLAK" : "/antrean"}>
                Lihat semua <ArrowRight size={14} />
              </LinkButton>
            }
          />
          {data.data && rows.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-slate-500">
              Tidak ada SKPI yang memerlukan tindakan Anda saat ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-[#F8FAFC]">
                  <tr>
                    <th className={th}>Lulusan</th>
                    <th className={th}>Nomor SKPI</th>
                    <th className={th}>Rantai</th>
                    <th className={cx(th, "text-right")}>Masuk tahap</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map(({ record: r, tag, since }) => (
                    <tr
                      key={`${r.npm}-${tag ?? ""}`}
                      onClick={() => open(r.npm)}
                      className="cursor-pointer border-t border-slate-200 transition-colors duration-150 hover:bg-slate-50"
                    >
                      <td className={td}>
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                          {r.name}
                          {tag && <Tag>{tag}</Tag>}
                        </p>
                        <p className="font-mono text-xs text-slate-500 tabular-nums">{r.npm}</p>
                        {isAdmin && r.reason && <p className="mt-1 max-w-sm text-xs text-slate-500">“{r.reason}”</p>}
                      </td>
                      <td className={cx(td, "font-mono text-xs text-slate-700 tabular-nums")}>{r.skpiId}</td>
                      <td className={td}>
                        <CustodyBar status={r.status} />
                      </td>
                      <td className={cx(td, "text-right text-xs text-slate-500 tabular-nums")}>{formatDate(since)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby={ids.feed} className="col-span-12 rounded-xl border border-slate-200 bg-[#F8FAFC] lg:col-span-4">
          <SectionTitle id={ids.feed} title="Aktivitas" aside={<span className="text-xs text-slate-500">7 peristiwa terbaru</span>} />
          <ol className="px-5">
            {(data.data?.activity ?? []).map((e) => (
              <li
                key={`${e.npm}-${e.at}-${e.action}`}
                className="grid grid-cols-[52px_1fr] gap-3 border-b border-slate-200 py-3.5 last:border-b-0"
              >
                <span className="pt-0.5 font-mono text-[11px] text-slate-400 tabular-nums">{formatTime(e.at)}</span>
                <div className="min-w-0">
                  <button type="button" onClick={() => navigate(`/daftar/${e.npm}`)} className="block w-full min-w-0 text-left">
                    <p className="text-sm text-slate-900">
                      <span className="font-semibold">{ACTION_LABEL[e.action]}</span>
                      <span className="text-slate-500"> · {e.name}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{formatDateTime(e.at)}</p>
                  </button>
                  <div className="mt-1">
                    {e.txId ? (
                      <Hash value={e.txId} />
                    ) : (
                      <span className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">off-chain</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
