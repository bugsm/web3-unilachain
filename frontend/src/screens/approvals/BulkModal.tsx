import { useEffect, useRef, useState } from "react"
import { Check, Clock3, PenLine, X } from "lucide-react"
import { ApiError, userMessage } from "@/api/errors"
import type { ApprovalOutcome, QueueItem } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { useUser } from "@/app/session"
import { Button, Modal, Tag, cx } from "@/components/ui"
import { DRAFT_TYPE_LABEL } from "@/domain/status"
import { approveBatch, bulk, chunk, dataOf, keyOf } from "./queue"

interface Outcome {
  item: QueueItem
  error: string | null
  /** Terkirim ke ledger tetapi konfirmasinya belum diterima (COMMIT_UNKNOWN); rekonsiliasi akan memastikannya. */
  pending: boolean
}

/** Hasil satu kelompok (satu transaksi batch): jumlah SKPI, lama sejak dikirim sampai jawaban server, dan rinciannya. */
interface Group {
  size: number
  ms: number
  ok: number
  pending: number
  failed: number
}

/** Kelompok yang sedang dikirim: penghitung waktu berjalan dari `startedAt`. */
interface Sending {
  index: number
  of: number
  size: number
  startedAt: number
}

const isPending = (code: string | undefined) => code === "COMMIT_UNKNOWN"
const seconds = (ms: number) => (ms / 1000).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Detik berjalan selama `since` ada; berhenti sendiri setelahnya. */
function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (since === null) return
    setNow(performance.now())
    const t = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(t)
  }, [since])
  return since === null ? 0 : Math.max(0, now - since)
}

/**
 * Konfirmasi → kirim per kelompok (satu permintaan = satu transaksi batch = satu blok) → ringkasan.
 * Selama mengirim, panel status menunjukkan kelompok yang berjalan dan detiknya; sesudahnya total waktu sampai tercatat di ledger.
 */
export function BulkModal({ items, open, onClose }: { items: QueueItem[]; open: boolean; onClose: (ran: boolean) => void }) {
  const api = useApi()
  const user = useUser()
  const [progress, setProgress] = useState<number | null>(null)
  const [results, setResults] = useState<Outcome[] | null>(null)
  const [sending, setSending] = useState<Sending | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [totalMs, setTotalMs] = useState(0)
  const lock = useRef(false)
  const noun = user.role === "dekan" ? "draft" : "SKPI"
  const groupElapsed = useElapsed(sending?.startedAt ?? null)

  async function run() {
    if (lock.current) return
    lock.current = true
    setProgress(0)
    setGroups([])
    const out: Outcome[] = []
    const done: Group[] = []
    const startedAt = performance.now()
    const all = chunk(items, bulk.size)
    // Kelompok dikirim berurutan; di dalam satu kelompok semua SKPI menjadi satu transaksi (satu blok).
    for (const [index, group] of all.entries()) {
      const groupStart = performance.now()
      setSending({ index: index + 1, of: all.length, size: group.length, startedAt: groupStart })
      let byKey: Map<string, ApprovalOutcome> | null = null
      let failedAll = ""
      let pendingAll = false
      try {
        byKey = new Map((await approveBatch(api, group)).map((r) => [r.key, r]))
      } catch (e) {
        failedAll = userMessage(e)
        pendingAll = e instanceof ApiError && isPending(e.code)
      }
      const before = out.length
      for (const item of group) {
        const r = byKey?.get(keyOf(item))
        let error: string | null
        if (failedAll) error = failedAll
        else if (!r) error = "Hasil tidak diterima dari server."
        else error = r.ok ? null : userMessage(new ApiError(r.status, r.code, r.message))
        out.push({ item, error, pending: failedAll ? pendingAll : !!r && !r.ok && isPending(r.code) })
      }
      const mine = out.slice(before)
      const ok = mine.filter((o) => !o.error).length
      const pending = mine.filter((o) => o.error && o.pending).length
      done.push({ size: group.length, ms: performance.now() - groupStart, ok, pending, failed: group.length - ok - pending })
      setGroups([...done])
      setProgress(out.length)
    }
    lock.current = false
    setTotalMs(performance.now() - startedAt)
    setSending(null)
    setProgress(null)
    setResults(out)
  }

  function finish() {
    if (lock.current) return
    const ran = results !== null
    setResults(null)
    setGroups([])
    onClose(ran)
  }

  const ok = results?.filter((r) => !r.error).length ?? 0
  const pending = results?.filter((r) => r.error && r.pending).length ?? 0
  const failed = (results?.length ?? 0) - ok - pending
  const summary = pending ? `${ok} berhasil, ${pending} menunggu konfirmasi, ${failed} gagal` : `${ok} berhasil, ${failed} gagal`

  return (
    <Modal
      open={open}
      onClose={finish}
      title={results ? summary : `Sahkan ${items.length} ${noun}?`}
      description={
        results
          ? pending
            ? "Yang menunggu konfirmasi sudah dikirim ke ledger; statusnya dipastikan otomatis dalam beberapa menit dan tidak perlu dikirim ulang. Item yang gagal tetap berada di antrean."
            : failed
              ? "Item yang gagal tetap berada di antrean dan dapat ditinjau ulang."
              : "Semua tercatat di ledger."
          : `Setiap ${noun} ditandatangani sebagai ${user.actorId}; tiap kelompok berisi sampai ${bulk.size} SKPI dalam satu transaksi.`
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
      {sending && <SendPanel sending={sending} elapsed={groupElapsed} groups={groups} />}
      {results && <ResultPanel ok={ok} pending={pending} totalMs={totalMs} groups={groups} />}

      <ul className="divide-y divide-line rounded-lg border border-line">
        {(results ?? items.map((item) => ({ item, error: undefined as string | null | undefined, pending: false }))).map(({ item, error, pending }) => {
          const d = dataOf(item)
          return (
            <li key={keyOf(item)} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 font-medium text-ink">
                  {d.name}
                  {item.kind === "draft" && (
                    <Tag tone={item.draft.type === "PERUBAHAN" ? "pending" : "muted"}>{DRAFT_TYPE_LABEL[item.draft.type]}</Tag>
                  )}
                </span>
                {error && <span className={cx("mt-0.5 block text-xs", pending ? "text-warn" : "text-bad")}>{error}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-xs text-slate-500 tabular-nums">{d.skpiId}</span>
                {error !== undefined && (
                  <span
                    aria-label={!error ? "Berhasil" : pending ? "Menunggu konfirmasi" : "Gagal"}
                    className={cx(
                      "grid size-5 place-items-center rounded-full",
                      !error ? "bg-ok-soft text-ok" : pending ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad",
                    )}
                  >
                    {!error ? <Check size={12} strokeWidth={3} /> : pending ? <Clock3 size={12} strokeWidth={2.5} /> : <X size={12} strokeWidth={3} />}
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

/** Status kelompok yang sedang dikirim: jumlah SKPI, detik berjalan, dan titik yang bergerak dari aplikasi ke ledger. */
function SendPanel({ sending, elapsed, groups }: { sending: Sending; elapsed: number; groups: Group[] }) {
  return (
    <div role="status" aria-live="polite" className="mb-4 rounded-xl border border-line bg-canvas px-5 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium text-ink">Mengirim {sending.size} SKPI ke ledger</p>
        <p className="font-mono text-sm text-ink tabular-nums">{seconds(elapsed)} detik</p>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Kelompok {sending.index} dari {sending.of} · satu transaksi: endorsement dua peer, diurutkan orderer, lalu masuk world state
      </p>
      {/* Titik emas berjalan berulang selama menunggu; dengan gerak dikurangi hanya penghitung detik yang tampil. */}
      <div aria-hidden className="relative mt-4 h-px bg-slate-300">
        <div className="flow-pulse-loop absolute inset-y-0 left-0 w-full motion-reduce:hidden">
          <span className="absolute top-1/2 left-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-glow" />
        </div>
      </div>
      <div aria-hidden className="mt-2 flex justify-between text-xs text-slate-500">
        <span>Aplikasi</span>
        <span>Ledger</span>
      </div>
      {groups.length > 0 && <GroupList groups={groups} />}
    </div>
  )
}

/** Ringkasan sesudah selesai: total waktu sampai tercatat, yang menunggu konfirmasi, dan rincian per kelompok. */
function ResultPanel({ ok, pending, totalMs, groups }: { ok: number; pending: number; totalMs: number; groups: Group[] }) {
  if (ok === 0 && pending === 0) return null
  return (
    <div className="mb-4 rounded-xl border border-line bg-canvas px-5 py-4 transition-[opacity,translate] duration-200 ease-out-ui starting:translate-y-1 starting:opacity-0">
      {ok > 0 && (
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ok-soft text-ok" aria-hidden>
            <Check size={12} strokeWidth={3} />
          </span>
          {ok} SKPI tercatat di ledger dalam {seconds(totalMs)} detik
        </p>
      )}
      {pending > 0 && (
        <p className={cx("flex items-center gap-2 text-sm font-medium text-warn", ok > 0 && "mt-2")}>
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-warn-soft" aria-hidden>
            <Clock3 size={12} strokeWidth={2.5} />
          </span>
          {pending} SKPI menunggu konfirmasi ledger
        </p>
      )}
      {groups.length > 0 && <GroupList groups={groups} />}
    </div>
  )
}

function GroupList({ groups }: { groups: Group[] }) {
  return (
    <ul aria-label="Rincian per kelompok" className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-slate-500">
      {groups.map((g, i) => (
        <li key={i} className="flex items-center justify-between gap-3 tabular-nums">
          <span>
            Kelompok {i + 1} · {g.size} SKPI
          </span>
          <span className="flex items-center gap-2">
            {g.ok === g.size ? (
              <span className="text-ok">tercatat</span>
            ) : (
              <span className={g.pending ? "text-warn" : "text-bad"}>
                {[g.ok && `${g.ok} tercatat`, g.pending && `${g.pending} menunggu`, g.failed && `${g.failed} gagal`].filter(Boolean).join(", ")}
              </span>
            )}
            <span className="font-mono text-ink">{seconds(g.ms)} detik</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
