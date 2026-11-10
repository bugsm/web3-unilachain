import { useRef, useState } from "react"
import { Ban, PenLine, X } from "lucide-react"
import { userMessage } from "@/api/errors"
import type { QueueItem } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { useUser } from "@/app/session"
import { useAsync } from "@/app/useAsync"
import { CustodySteps } from "@/components/Custody"
import { Button, Field, Modal, StatusBadge, Textarea, cx } from "@/components/ui"
import { issuerLabel } from "@/domain/faculty"
import { formatDateTime } from "@/domain/format"
import { normalizeReason, predicateOf, validateReason } from "@/domain/skpi"
import { DRAFT_TYPE_LABEL, FIELD_LABEL } from "@/domain/status"
import { approve, approveLabel, approvedMessage, dataOf, npmOf, reject, rejectedMessage } from "./queue"

const FIELDS = ["name", "skpiId", "programStudy", "totalSKP"] as const

function Meta({ rows }: { rows: Array<[string, string, boolean?]> }) {
  return (
    <dl className="divide-y divide-slate-200 border-y border-slate-200 text-sm">
      {rows.map(([k, v, mono]) => (
        <div key={k} className="grid grid-cols-[130px_1fr] gap-4 py-3">
          <dt className="text-slate-500">{k}</dt>
          <dd className={cx("font-medium break-words text-slate-900", mono && "font-mono text-[13px] tabular-nums")}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ReviewModal({
  item: incoming,
  onClose,
  onDone,
}: {
  item: QueueItem | null
  onClose: () => void
  onDone: (message: string) => void
}) {
  const api = useApi()
  const user = useUser()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  // Pertahankan item terakhir agar isi modal tetap tampil selama transisi keluar.
  const last = useRef<QueueItem | null>(null)
  if (incoming) last.current = incoming
  const item = incoming ?? last.current
  const npm = item ? npmOf(item) : ""
  const detail = useAsync(() => (npm ? api.getRecord(npm) : Promise.resolve(null)), [api, npm])

  const close = () => {
    if (lock.current) return
    setRejecting(false)
    setReason("")
    setError(null)
    onClose()
  }

  async function run(kind: "approve" | "reject") {
    // Modal yang sedang menutup (transisi keluar) mengabaikan aksi, termasuk klik/Enter susulan.
    if (!incoming || lock.current) return
    lock.current = true
    setBusy(kind)
    setError(null)
    try {
      if (kind === "approve") await approve(api, incoming)
      else await reject(api, incoming, normalizeReason(reason))
      lock.current = false
      setBusy(null)
      setRejecting(false)
      setReason("")
      onDone(kind === "approve" ? approvedMessage(incoming) : rejectedMessage(incoming))
    } catch (e) {
      lock.current = false
      setBusy(null)
      setError(userMessage(e))
    }
  }

  const data = item ? dataOf(item) : null
  const record = item?.record ?? null
  const draft = item?.kind === "draft" ? item.draft : null
  const typeLabel = draft ? DRAFT_TYPE_LABEL[draft.type].toLowerCase() : "SKPI"
  const isRevoke = draft?.type === "PENCABUTAN"
  const reasonError = validateReason(reason)
  const reasonHint =
    item?.kind === "rektor" ? "Alasan dicatat di ledger (TolakRektor)." : "Alasan disimpan off-chain dan terlihat oleh admin fakultas."

  return (
    <Modal
      open={!!incoming}
      onClose={close}
      width="max-w-3xl"
      title={item && data ? `Tinjau ${typeLabel} · ${data.name}` : ""}
      description={
        isRevoke
          ? "Persetujuan mencabut SKPI secara permanen di ledger. Verifikator akan melihat status Dicabut."
          : "Cocokkan data dengan dokumen fisik sebelum menandatangani. Tanda tangan bersifat permanen di ledger."
      }
      footer={
        item &&
        (rejecting ? (
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)} disabled={!!busy}>
              Kembali
            </Button>
            <Button variant="dangerSolid" disabled={!!reasonError} loading={busy === "reject"} onClick={() => run("reject")}>
              {item.kind === "rektor" ? "Tolak (TolakRektor)" : "Tolak draft"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger" onClick={() => setRejecting(true)} className="mr-auto" disabled={!!busy}>
              <X size={15} /> Tolak
            </Button>
            <Button variant="ghost" onClick={close} disabled={!!busy}>
              Nanti
            </Button>
            <Button variant={isRevoke ? "dangerSolid" : "primary"} loading={busy === "approve"} loadingLabel="Mengirim transaksi…" onClick={() => run("approve")}>
              {isRevoke ? <Ban size={15} /> : <PenLine size={15} />} {approveLabel(item)}
            </Button>
          </>
        ))
      }
    >
      {item && data && (
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 md:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">
                {draft?.type === "PERUBAHAN" ? "Perubahan diusulkan" : "Metadata"}
              </p>
              {record && <StatusBadge status={record.status} />}
            </div>

            {draft?.type === "PERUBAHAN" && draft.data ? (
              <table aria-label="Sebelum dan sesudah" className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] tracking-[0.08em] text-slate-500 uppercase">
                    <th className="py-2 font-semibold">Atribut</th>
                    <th className="py-2 font-semibold">Sebelum</th>
                    <th className="py-2 font-semibold">Sesudah</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.filter((f) => String(data[f]) !== String(draft.data![f])).map((f) => (
                    <tr key={f} className="border-t border-slate-200">
                      <td className="py-3 text-slate-500">{FIELD_LABEL[f]}</td>
                      <td className="py-3 text-slate-500 line-through decoration-slate-300">{String(data[f])}</td>
                      <td className="py-3 font-semibold text-slate-900">{String(draft.data![f])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Meta
                rows={[
                  ["Nama lulusan", data.name],
                  ["NPM", data.npm, true],
                  ["Nomor SKPI", data.skpiId, true],
                  ["Program studi", data.programStudy],
                  ["Total SKP", `${data.totalSKP} · ${predicateOf(data.totalSKP) ?? "—"}`],
                  ["Penerbit", record ? issuerLabel(record.facultyCode) : "—"],
                  ["Waktu terbit", record?.issuedTimestamp ? formatDateTime(record.issuedTimestamp) : "Saat Dekan menyetujui", !!record?.issuedTimestamp],
                ]}
              />
            )}

            {isRevoke && draft?.reason && (
              <div className="mt-6 rounded-lg border border-rose-200 bg-[#FFF1F2] px-5 py-4 text-sm">
                <p className="font-semibold text-[#E11D48]">Alasan pencabutan dari admin</p>
                <p className="mt-1 text-slate-700">{draft.reason}</p>
              </div>
            )}

            {rejecting && (
              <Field label="Alasan penolakan" hint={reasonHint} className="mt-6">
                <Textarea
                  autoFocus
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: Nomor SKPI tidak sesuai dengan dokumen fisik."
                />
              </Field>
            )}
            {error && (
              <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-[#FFF1F2] px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            )}
          </div>
          <div className="col-span-12 md:col-span-5">
            <p className="mb-4 text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">Rantai pengesahan</p>
            {record && <CustodySteps status={record.status} history={detail.data?.history ?? []} layout="vertical" />}
            <p className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
              Anda menandatangani sebagai <span className="font-mono text-slate-700">{user.actorId}</span>
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}
