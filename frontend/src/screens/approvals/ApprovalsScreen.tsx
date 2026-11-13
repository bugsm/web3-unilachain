import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { Check, PenLine, Search } from "lucide-react"
import type { QueueItem } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { notify } from "@/app/notify"
import { useUser } from "@/app/session"
import { useAsync } from "@/app/useAsync"
import { CustodyBar } from "@/components/Custody"
import { Button, Input, PageHeader, Tag, cx, td, th } from "@/components/ui"
import { LoadError } from "@/components/ui/LoadError"
import { formatDateTime } from "@/domain/format"
import { predicateOf } from "@/domain/skpi"
import { DRAFT_TYPE_LABEL } from "@/domain/status"
import { BulkModal } from "./BulkModal"
import { PagerBar, PageSizeSelect } from "./Pager"
import { usePaging } from "./paging"
import { bulkable, dataOf, keyOf, npmOf, sinceOf } from "./queue"
import { ReviewModal } from "./ReviewModal"

export function ApprovalsScreen() {
  const api = useApi()
  const user = useUser()
  const isDekan = user.role === "dekan"
  const [params, setParams] = useSearchParams()
  const queue = useAsync(() => api.listQueue(), [api])
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [review, setReview] = useState<QueueItem | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const items = useMemo(() => queue.data ?? [], [queue.data])
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      const d = dataOf(it)
      return !q || `${d.name} ${d.npm} ${d.skpiId} ${d.programStudy}`.toLowerCase().includes(q)
    })
  }, [items, query])
  const paging = usePaging(rows)
  const picked = items.filter((it) => selected.has(keyOf(it)) && bulkable(it))
  // "Pilih semua" berlaku untuk baris yang sedang tampil (bukan yang ada di halaman lain).
  const selectable = paging.visible.filter(bulkable)
  const allChecked = selectable.length > 0 && selectable.every((r) => selected.has(keyOf(r)))

  // Tautan dari ikhtisar: /antrean?tinjau=<npm> membuka modal tinjau.
  const focus = params.get("tinjau")
  useEffect(() => {
    if (!focus || !queue.data) return
    const hit = queue.data.find((it) => npmOf(it) === focus)
    if (hit) setReview(hit)
    setParams((p) => {
      p.delete("tinjau")
      return p
    }, { replace: true })
  }, [focus, queue.data, setParams])

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  return (
    <>
      <PageHeader
        eyebrow={isDekan ? "Pengesahan Dekan" : "Pengesahan Rektor"}
        title="Antrean pengesahan"
        description={
          isDekan
            ? `Draft dari admin ${user.faculty}. Persetujuan Anda dikirim sebagai transaksi (SahkanDekan, PerbaruiSKPI, atau CabutSKPI); penolakan hanya tersimpan off-chain.`
            : "SKPI dari seluruh fakultas yang telah disahkan Dekan. Setelah Anda sahkan, SKPI aktif dan dapat diverifikasi publik."
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="pointer-events-none absolute top-3 left-3 text-slate-400" />
          <Input
            aria-label="Cari di antrean"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              paging.setPage(1)
            }}
            placeholder="Cari nama, NPM, atau nomor SKPI"
            className="pl-9"
          />
        </div>
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-ink tabular-nums">{queue.data ? rows.length : "–"}</span> menunggu
        </p>
        <PageSizeSelect value={paging.size} onChange={paging.setSize} />
        {/* Bilah aksi massal: transisi (bukan keyframe) agar dapat diinterupsi saat pilihan berubah cepat. */}
        <div
          inert={selected.size === 0}
          data-state={selected.size ? "open" : "closed"}
          className="ml-auto flex items-center gap-3 rounded-lg bg-ink py-1.5 pr-1.5 pl-4 text-sm text-white transition-[opacity,translate] duration-200 ease-out-ui data-[state=closed]:pointer-events-none data-[state=closed]:translate-y-2 data-[state=closed]:opacity-0"
        >
          <span className="tabular-nums">{selected.size} dipilih</span>
          <button type="button" onClick={() => setSelected(new Set())} className="text-slate-400 transition-colors hover:text-white">
            Batal
          </button>
          <Button size="sm" variant="primary" onClick={() => setBulkOpen(true)}>
            <PenLine size={14} /> Sahkan terpilih
          </Button>
        </div>
      </div>

      {queue.error !== undefined && (
        <div className="mb-4">
          <LoadError error={queue.error} onRetry={queue.reload} />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        {queue.data && rows.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-ok-soft text-ok">
              <Check size={18} strokeWidth={3} />
            </span>
            <p className="mt-4 text-sm font-semibold text-ink">Antrean kosong</p>
            <p className="mt-1 text-sm text-slate-500">Semua SKPI pada tahap Anda telah ditinjau.</p>
          </div>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-canvas">
                <tr>
                  <th className={cx(th, "w-12")}>
                    <input
                      type="checkbox"
                      aria-label="Pilih semua"
                      checked={allChecked}
                      onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map(keyOf)))}
                      className="size-4 accent-brand"
                    />
                  </th>
                  <th className={th}>Lulusan</th>
                  {isDekan && <th className={th}>Jenis</th>}
                  <th className={th}>Nomor SKPI</th>
                  <th className={th}>Program studi</th>
                  <th className={cx(th, "text-right")}>Total SKP</th>
                  <th className={th}>Rantai</th>
                  <th className={th}>{isDekan ? "Diajukan" : "Disahkan Dekan"}</th>
                  <th className={th}>
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paging.visible.map((it) => {
                  const d = dataOf(it)
                  const key = keyOf(it)
                  const on = selected.has(key)
                  return (
                    <tr key={key} className={cx("border-t border-line transition-colors duration-150", on ? "bg-brand-soft" : "hover:bg-slate-50")}>
                      <td className={td}>
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${d.name}`}
                          checked={on}
                          disabled={!bulkable(it)}
                          title={bulkable(it) ? undefined : "Pencabutan ditinjau satu per satu"}
                          onChange={() => toggle(key)}
                          className="size-4 accent-brand"
                        />
                      </td>
                      <td className={td}>
                        <p className="font-semibold text-ink">{d.name}</p>
                        <p className="font-mono text-xs text-slate-500 tabular-nums">{d.npm}</p>
                      </td>
                      {isDekan && (
                        <td className={td}>
                          {it.kind === "draft" && (
                            <Tag tone={it.draft.type === "PENCABUTAN" ? "revoked" : it.draft.type === "PERUBAHAN" ? "pending" : "muted"}>
                              {DRAFT_TYPE_LABEL[it.draft.type]}
                            </Tag>
                          )}
                        </td>
                      )}
                      <td className={cx(td, "font-mono text-xs text-slate-700 tabular-nums")}>{d.skpiId}</td>
                      <td className={td}>
                        <p className="text-slate-700">{d.programStudy}</p>
                        <p className="font-mono text-xs text-slate-500">Dekan {it.record?.facultyCode}</p>
                      </td>
                      <td className={cx(td, "text-right")}>
                        <p className="font-mono text-ink tabular-nums">{d.totalSKP}</p>
                        <p className="text-xs text-slate-500">{predicateOf(d.totalSKP)}</p>
                      </td>
                      <td className={td}>{it.record && <CustodyBar status={it.record.status} />}</td>
                      <td className={cx(td, "text-xs text-slate-500 tabular-nums")}>{formatDateTime(sinceOf(it))}</td>
                      <td className={cx(td, "text-right")}>
                        <Button size="sm" onClick={() => setReview(it)}>
                          Tinjau
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <PagerBar from={paging.from} to={paging.to} total={paging.total} page={paging.page} pages={paging.pages} onPage={paging.setPage} />
      </div>

      <ReviewModal
        item={review}
        onClose={() => setReview(null)}
        onDone={(message) => {
          const key = review ? keyOf(review) : ""
          setReview(null)
          setSelected((s) => {
            const n = new Set(s)
            n.delete(key)
            return n
          })
          notify(message)
          queue.reload()
        }}
      />
      <BulkModal
        open={bulkOpen}
        items={picked}
        onClose={(ran) => {
          setBulkOpen(false)
          if (ran) {
            setSelected(new Set())
            queue.reload()
          }
        }}
      />
    </>
  )
}
