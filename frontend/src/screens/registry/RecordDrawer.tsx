import { useRef, useState } from "react"
import { Ban, PenLine, RotateCcw } from "lucide-react"
import type { RecordDetail } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { notify } from "@/app/notify"
import { useUser } from "@/app/session"
import { useAsync } from "@/app/useAsync"
import { CustodySteps } from "@/components/Custody"
import { Button, Drawer, Hash, LinkButton, StatusBadge, Tag, cx } from "@/components/ui"
import { LoadError } from "@/components/ui/LoadError"
import { issuerLabel } from "@/domain/faculty"
import { formatDate, formatDateTime } from "@/domain/format"
import { ACTION_LABEL, DRAFT_TYPE_LABEL, FIELD_LABEL } from "@/domain/status"
import { DraftFormModal } from "./DraftFormModal"
import { RevokeModal } from "./RevokeModal"

export function pendingTag(r: { status: string; pendingDraft: RecordDetail["pendingDraft"] }) {
  const p = r.pendingDraft
  if (!p || p.type === "PENCATATAN") return null
  return `${DRAFT_TYPE_LABEL[p.type]} ${p.status === "DITOLAK_DEKAN" ? "ditolak" : "diajukan"}`
}

function Detail({ record: r }: { record: RecordDetail }) {
  const history = [...r.history].reverse()
  const tag = pendingTag(r)
  const reasonTitle = r.status === "DICABUT" ? "Alasan pencabutan" : r.status === "DITOLAK_REKTOR" ? "Alasan penolakan Rektor" : "Alasan penolakan Dekan"
  return (
    <div className="px-6 py-8 sm:px-8">
      <p className="font-mono text-xs text-slate-500 tabular-nums">{r.npm}</p>
      <h2 className="mt-1 pr-10 text-2xl font-semibold tracking-[-0.02em] text-slate-900">{r.name}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={r.status} />
        {tag && <Tag tone={r.pendingDraft?.type === "PENCABUTAN" ? "revoked" : "pending"}>{tag}</Tag>}
      </div>

      {r.reason && (
        <div className={cx("mt-6 border-l-2 py-1 pl-4 text-sm", r.status === "DICABUT" ? "border-[#E11D48]" : "border-slate-300")}>
          <p className="font-semibold text-slate-900">{reasonTitle}</p>
          <p className="mt-1 text-slate-600">{r.reason}</p>
        </div>
      )}
      {r.pendingDraft && r.pendingDraft.type !== "PENCATATAN" && r.pendingDraft.status === "DITOLAK_DEKAN" && (
        <div className="mt-6 border-l-2 border-slate-300 py-1 pl-4 text-sm">
          <p className="font-semibold text-slate-900">Draft {DRAFT_TYPE_LABEL[r.pendingDraft.type].toLowerCase()} ditolak Dekan</p>
          <p className="mt-1 text-slate-600">{r.pendingDraft.rejectReason}</p>
        </div>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-slate-200 pt-6 text-sm">
        {(
          [
            ["Nomor SKPI", r.skpiId, true, false],
            ["Waktu terbit", r.issuedTimestamp ? formatDateTime(r.issuedTimestamp) : "Belum (draft)", !!r.issuedTimestamp, false],
            ["Program studi", r.programStudy, false, false],
            ["Total SKP", `${r.totalSKP} · ${r.predicate}`, false, false],
            ["Penerbit", issuerLabel(r.facultyCode), false, true],
            ["Riwayat", `${r.history.length} peristiwa`, false, false],
          ] as const
        ).map(([k, v, mono, wide]) => (
          <div key={k} className={wide ? "col-span-2" : undefined}>
            <dt className="text-xs text-slate-500">{k}</dt>
            <dd className={cx("mt-1 font-medium text-slate-900", mono && "font-mono text-[13px] tabular-nums")}>{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10">
        <h3 className="mb-5 text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">Rantai pengesahan</h3>
        <CustodySteps status={r.status} history={r.history} layout="vertical" />
      </section>

      <section className="mt-10">
        <h3 id="riwayat" className="mb-3 text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">
          Riwayat
        </h3>
        <ol aria-label="Riwayat" className="border-t border-slate-200">
          {history.map((e, i) => (
            <li key={`${e.at}-${i}`} className="grid grid-cols-[72px_1fr] gap-3 border-b border-slate-200 py-3.5">
              <span className="pt-0.5 font-mono text-[11px] text-slate-400 tabular-nums">{formatDate(e.at)}</span>
              <div className="min-w-0">
                <p className="text-sm">
                  {e.kind === "ledger" ? (
                    <span className="font-mono text-[13px] font-medium text-slate-900">{e.action}</span>
                  ) : (
                    <span className="font-medium text-slate-900">{ACTION_LABEL[e.action]}</span>
                  )}
                  <span className="text-slate-500"> · {e.actor}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">{formatDateTime(e.at)}</p>
                {e.changes.length > 0 && (
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                    {e.changes.map((c) => `${FIELD_LABEL[c.field]}: ${c.from} → ${c.to}`).join("; ")}
                  </p>
                )}
                {e.note && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{e.note}</p>}
                <div className="mt-1.5">
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
  )
}

function AdminActions({ record: r, onModal }: { record: RecordDetail; onModal: (m: "perubahan" | "perbaiki" | "cabut") => void }) {
  const p = r.pendingDraft
  const note = (t: string) => <p className="mr-auto text-xs text-slate-500">{t}</p>
  if (p?.status === "MENUNGGU_DEKAN")
    return note(p.type === "PENCATATAN" ? "Menunggu keputusan Dekan." : `Menunggu keputusan Dekan atas draft ${DRAFT_TYPE_LABEL[p.type].toLowerCase()}.`)
  if (r.status === "MENUNGGU_REKTOR") return note("Menunggu pengesahan Rektor.")
  if (r.status === "DICABUT" || r.status === "DITOLAK_REKTOR")
    return (
      <>
        {note(r.status === "DICABUT" ? "SKPI yang dicabut tidak dapat diubah." : "Ditolak Rektor; NPM dapat dicatat ulang.")}
        <LinkButton to={`/catat?npm=${r.npm}`} variant="primary">
          <RotateCcw size={15} /> Catat ulang
        </LinkButton>
      </>
    )
  const fixable = p?.status === "DITOLAK_DEKAN" && p.type !== "PENCABUTAN"
  return (
    <>
      {r.status === "AKTIF" && (
        <Button variant="danger" className="mr-auto" onClick={() => onModal("cabut")}>
          <Ban size={15} /> Ajukan pencabutan
        </Button>
      )}
      {fixable ? (
        <Button variant="primary" onClick={() => onModal("perbaiki")}>
          <PenLine size={15} /> Perbaiki &amp; ajukan ulang
        </Button>
      ) : (
        r.status === "AKTIF" && (
          <Button variant="primary" onClick={() => onModal("perubahan")}>
            <PenLine size={15} /> Ajukan perubahan
          </Button>
        )
      )}
    </>
  )
}

export function RecordDrawer({ npm, onClose, onChanged }: { npm: string | null; onClose: () => void; onChanged: () => void }) {
  const api = useApi()
  const user = useUser()
  const [modal, setModal] = useState<"perubahan" | "perbaiki" | "cabut" | null>(null)
  // Pertahankan NPM terakhir agar isi drawer tetap ada selama transisi keluar.
  const last = useRef<string | null>(null)
  if (npm) last.current = npm
  const shown = npm ?? last.current
  const detail = useAsync(() => (shown ? api.getRecord(shown) : Promise.resolve(null)), [api, shown])
  const r = detail.data && detail.data.npm === shown ? detail.data : null

  const saved = (message: string) => {
    setModal(null)
    notify(message)
    detail.reload()
    onChanged()
  }

  return (
    <>
      <Drawer
        open={!!npm}
        onClose={onClose}
        label={`Detail SKPI ${r?.name ?? shown ?? ""}`}
        footer={
          r &&
          (user.role === "admin" ? (
            <AdminActions record={r} onModal={setModal} />
          ) : (
            <p className="mr-auto text-xs text-slate-500">Perubahan dan pencabutan diajukan oleh admin fakultas.</p>
          ))
        }
      >
        {detail.error !== undefined && (
          <div className="p-8">
            <LoadError error={detail.error} onRetry={detail.reload} />
          </div>
        )}
        {r && <Detail record={r} />}
      </Drawer>
      {r && (modal === "perubahan" || modal === "perbaiki") && (
        <DraftFormModal mode={modal} record={r} draft={r.pendingDraft} onClose={() => setModal(null)} onSaved={saved} />
      )}
      {r && modal === "cabut" && <RevokeModal record={r} onClose={() => setModal(null)} onSaved={saved} />}
    </>
  )
}
