import { useRef, useState } from "react"
import { Check, PenLine, X } from "lucide-react"
import { userMessage } from "@/api/errors"
import type { QueueItem } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { useUser } from "@/app/session"
import { Button, Modal, cx } from "@/components/ui"
import { approve, dataOf, keyOf } from "./queue"

interface Outcome {
  item: QueueItem
  error: string | null
}

/** Konfirmasi → kirim berurutan (satu transaksi per item) → ringkasan per item. */
export function BulkModal({ items, open, onClose }: { items: QueueItem[]; open: boolean; onClose: (ran: boolean) => void }) {
  const api = useApi()
  const user = useUser()
  const [progress, setProgress] = useState<number | null>(null)
  const [results, setResults] = useState<Outcome[] | null>(null)
  const lock = useRef(false)
  const noun = user.role === "dekan" ? "draft" : "SKPI"

  async function run() {
    if (lock.current) return
    lock.current = true
    const out: Outcome[] = []
    for (let i = 0; i < items.length; i++) {
      setProgress(i + 1)
      try {
        await approve(api, items[i])
        out.push({ item: items[i], error: null })
      } catch (e) {
        out.push({ item: items[i], error: userMessage(e) })
      }
    }
    lock.current = false
    setProgress(null)
    setResults(out)
  }

  function finish() {
    if (lock.current) return
    const ran = results !== null
    setResults(null)
    onClose(ran)
  }

  const ok = results?.filter((r) => !r.error).length ?? 0
  const failed = (results?.length ?? 0) - ok

  return (
    <Modal
      open={open}
      onClose={finish}
      title={results ? `${ok} berhasil, ${failed} gagal` : `Sahkan ${items.length} ${noun}?`}
      description={
        results
          ? "Item yang gagal tetap berada di antrean dan dapat ditinjau ulang."
          : `Setiap ${noun} ditandatangani sebagai ${user.actorId} dalam transaksi terpisah.`
      }
      footer={
        results ? (
          <Button variant="primary" onClick={finish}>
            Selesai
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={finish} disabled={progress !== null}>
              Batal
            </Button>
            <Button
              variant="primary"
              onClick={run}
              loading={progress !== null}
              loadingLabel={`Mengesahkan ${progress ?? 0}/${items.length}…`}
            >
              <PenLine size={15} /> Sahkan {items.length} {noun}
            </Button>
          </>
        )
      }
    >
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
        {(results ?? items.map((item) => ({ item, error: undefined as string | null | undefined }))).map(({ item, error }) => {
          const d = dataOf(item)
          return (
            <li key={keyOf(item)} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-medium text-slate-900">{d.name}</span>
                {error && <span className="mt-0.5 block text-xs text-[#E11D48]">{error}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-xs text-slate-500 tabular-nums">{d.skpiId}</span>
                {error !== undefined && (
                  <span
                    aria-label={error ? "Gagal" : "Berhasil"}
                    className={cx(
                      "grid size-5 place-items-center rounded-full",
                      error ? "bg-[#FFE4E6] text-[#E11D48]" : "bg-[#D1FAE5] text-[#059669]",
                    )}
                  >
                    {error ? <X size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
