import { useId, useRef, useState } from "react"
import { History, PenLine, UserRoundPlus } from "lucide-react"
import type { Office, Official, OfficialChange } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { notify } from "@/app/notify"
import { useUser } from "@/app/session"
import { useAsync } from "@/app/useAsync"
import { Button, Drawer, PageHeader, cx, td, th } from "@/components/ui"
import { LoadError } from "@/components/ui/LoadError"
import { FACULTIES, facultyByCode, type FacultyCode } from "@/domain/faculty"
import { formatDate, formatDateTime } from "@/domain/format"
import { OFFICE_LABEL, canEditOffice } from "@/domain/officials"
import { OfficialModal, type OfficialAction } from "./OfficialModal"

const current = (o: Official) => o.periods[o.periods.length - 1]

function LastChange({ change }: { change: OfficialChange | null }) {
  if (!change) return <span className="text-slate-400">belum pernah diubah</span>
  return (
    <span>
      terakhir diubah oleh <span className="font-mono text-slate-700">{change.by}</span> · {formatDateTime(change.at)}
    </span>
  )
}

function Actions({ official, onAction, onHistory }: { official: Official; onAction: (a: OfficialAction) => void; onHistory: () => void }) {
  const user = useUser()
  const editable = canEditOffice(user, official.office)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {editable && (
        <>
          <Button size="sm" onClick={() => onAction({ kind: "koreksi", official, period: current(official) })}>
            <PenLine size={14} /> Koreksi nama
          </Button>
          <Button size="sm" onClick={() => onAction({ kind: "pergantian", official })}>
            <UserRoundPlus size={14} /> Catat pergantian
          </Button>
        </>
      )}
      <Button size="sm" variant="ghost" onClick={onHistory}>
        <History size={14} /> Riwayat
      </Button>
    </div>
  )
}

function HistoryDrawer({
  office,
  official,
  onClose,
  onAction,
}: {
  office: Office | null
  official: Official | null
  onClose: () => void
  onAction: (a: OfficialAction) => void
}) {
  const api = useApi()
  const user = useUser()
  // Pertahankan jabatan terakhir agar isi tetap ada selama transisi keluar.
  const last = useRef<Office | null>(null)
  if (office) last.current = office
  const shown = office ?? last.current
  const changes = useAsync(() => (shown ? api.officialChanges(shown) : Promise.resolve([])), [api, shown, official?.lastChange?.id])
  const label = shown ? OFFICE_LABEL(shown) : ""
  return (
    <Drawer open={!!office} onClose={onClose} label={`Riwayat ${label}`}>
      {official && (
        <div className="px-6 py-8 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">{label}</p>
          <h2 className="mt-1 pr-10 text-2xl font-semibold tracking-[-0.02em] text-slate-900">Riwayat jabatan</h2>

          <h3 className="mt-8 mb-3 text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">Periode</h3>
          <ol aria-label="Periode jabatan" className="border-t border-slate-200">
            {[...official.periods].reverse().map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-4 border-b border-slate-200 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{p.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                    {formatDate(p.from)} – {p.to ? formatDate(p.to) : "sekarang"}
                  </p>
                </div>
                {canEditOffice(user, official.office) && (
                  <Button size="sm" variant="ghost" onClick={() => onAction({ kind: "koreksi", official, period: p })}>
                    Koreksi
                  </Button>
                )}
              </li>
            ))}
          </ol>

          <h3 className="mt-10 mb-3 text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">Perubahan</h3>
          {changes.error !== undefined && <LoadError error={changes.error} onRetry={changes.reload} />}
          {changes.data && changes.data.length === 0 && <p className="text-sm text-slate-500">Belum ada perubahan.</p>}
          {changes.data && changes.data.length > 0 && (
            <ol aria-label="Perubahan" className="border-t border-slate-200">
              {changes.data.map((c) => (
                <li key={c.id} className="border-b border-slate-200 py-3.5 text-sm">
                  <p>
                    <span className="font-mono text-[12px] font-semibold text-slate-900">{c.kind}</span>
                    <span className="text-slate-500"> · {c.by}</span>
                  </p>
                  <p className="mt-1 text-slate-700">
                    {c.before} → {c.after}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 tabular-nums">{formatDateTime(c.at)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Drawer>
  )
}

export function OfficialsScreen() {
  const api = useApi()
  const user = useUser()
  const rektorId = useId()
  const list = useAsync(() => api.listOfficials(), [api])
  const [action, setAction] = useState<OfficialAction | null>(null)
  const [historyOf, setHistoryOf] = useState<Office | null>(null)
  const byOffice = new Map((list.data ?? []).map((o) => [o.office, o]))
  const rektor = byOffice.get("REKTOR")

  return (
    <>
      <PageHeader
        eyebrow="Penanda tangan"
        title="Pejabat"
        description="Nama rektor dan dekan yang tampil pada hasil verifikasi. Nama dipilih menurut waktu pengesahan, sehingga SKPI lama tetap menampilkan pejabat yang menandatanganinya."
      />
      {user.role !== "admin" && <p className="mb-6 text-sm text-slate-500">Nama pejabat dikelola admin fakultas.</p>}
      {list.error !== undefined && (
        <div className="mb-6">
          <LoadError error={list.error} onRetry={list.reload} />
        </div>
      )}

      <section aria-labelledby={rektorId} className="rounded-xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={rektorId} className="text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">
              Rektor
            </h2>
            {rektor && (
              <>
                <p className="mt-2 text-xl font-semibold tracking-[-0.01em] text-slate-900">{current(rektor).name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Universitas Lampung · menjabat sejak {formatDate(current(rektor).from)}
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  <LastChange change={rektor.lastChange} />
                </p>
              </>
            )}
          </div>
          {rektor && <Actions official={rektor} onAction={setAction} onHistory={() => setHistoryOf("REKTOR")} />}
        </div>
      </section>

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-200">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-[#F8FAFC]">
              <tr>
                <th className={th}>Fakultas</th>
                <th className={th}>Dekan</th>
                <th className={th}>Perubahan terakhir</th>
                <th className={th}>
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {FACULTIES.map((f) => {
                const o = byOffice.get(f.code as FacultyCode)
                return (
                  <tr key={f.code} className={cx("border-t border-slate-200", f.code === user.faculty && "bg-[#F8FAFC]")}>
                    <td className={td}>
                      <p className="font-mono text-xs font-semibold text-slate-900">{f.code}</p>
                      <p className="text-xs text-slate-500">{facultyByCode(f.code).name}</p>
                    </td>
                    <td className={td}>
                      {o && (
                        <>
                          <p className="font-medium text-slate-900">{current(o).name}</p>
                          <p className="text-xs text-slate-500">sejak {formatDate(current(o).from)}</p>
                        </>
                      )}
                    </td>
                    <td className={cx(td, "text-xs text-slate-500")}>{o && <LastChange change={o.lastChange} />}</td>
                    <td className={cx(td, "text-right")}>
                      {o && <Actions official={o} onAction={setAction} onHistory={() => setHistoryOf(f.code)} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <HistoryDrawer
        office={historyOf}
        official={historyOf ? (byOffice.get(historyOf) ?? null) : null}
        onClose={() => setHistoryOf(null)}
        onAction={setAction}
      />
      {action && (
        <OfficialModal
          action={action}
          onClose={() => setAction(null)}
          onSaved={(m) => {
            setAction(null)
            notify(m)
            list.reload()
          }}
        />
      )}
    </>
  )
}
