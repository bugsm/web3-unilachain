import { Ban, Check, Clock3, X } from "lucide-react"
import type { HistoryEntry, RecordStatus } from "@/api/types"
import { custody, type StageState } from "@/domain/custody"
import { formatDate, formatDateTime } from "@/domain/format"
import { cx } from "./ui/cx"
import { Hash } from "./ui/Hash"

const SEGMENT: Record<StageState, string> = {
  done: "bg-brand",
  current: "bg-warn",
  pending: "bg-slate-200",
  rejected: "bg-slate-400",
  revoked: "bg-bad",
}

interface Props {
  status: RecordStatus
  history?: HistoryEntry[]
}

export function CustodyBar({ status, history }: Props) {
  const stages = custody(status, history)
  return (
    <div
      role="img"
      className="flex items-center gap-1"
      aria-label={stages.map((s) => `${s.label}: ${s.stateLabel}`).join(", ")}
    >
      {stages.map((s) => (
        <span key={s.key} title={`${s.label} · ${s.stateLabel}`} className={cx("h-1.5 w-6 rounded-full", SEGMENT[s.state])} />
      ))}
    </div>
  )
}

function StageNode({ state }: { state: StageState }) {
  const base = "relative z-10 grid size-7 shrink-0 place-items-center rounded-full"
  if (state === "done")
    return (
      <span className={cx(base, "bg-brand text-white")}>
        <Check size={14} strokeWidth={3} />
      </span>
    )
  if (state === "current")
    return (
      <span className={cx(base, "bg-warn-soft text-warn ring-4 ring-warn-soft/60")}>
        <Clock3 size={14} strokeWidth={2.5} />
      </span>
    )
  if (state === "rejected")
    return (
      <span className={cx(base, "bg-canvas text-slate-500")}>
        <X size={14} strokeWidth={3} />
      </span>
    )
  if (state === "revoked")
    return (
      <span className={cx(base, "bg-bad-soft text-bad")}>
        <Ban size={14} strokeWidth={2.5} />
      </span>
    )
  return <span className={cx(base, "border-2 border-dashed border-slate-300 bg-white")} />
}

export function CustodySteps({ status, history = [], layout = "horizontal" }: Props & { layout?: "horizontal" | "vertical" }) {
  const stages = custody(status, history)
  if (layout === "vertical")
    return (
      <ol>
        {stages.map((s, i) => (
          <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
            {i < stages.length - 1 && (
              <span
                className={cx("absolute top-7 bottom-0 left-[13px] w-0.5", s.state === "done" ? "bg-brand" : "bg-slate-200")}
              />
            )}
            <StageNode state={s.state} />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-ink">
                  {s.label} <span className="font-normal text-slate-500">· {s.sub}</span>
                </p>
                <span className="shrink-0 text-xs font-medium text-slate-500">{s.stateLabel}</span>
              </div>
              {s.event && (
                <div className="mt-2 space-y-1.5 text-xs text-slate-600">
                  <p>
                    <span className="font-medium text-slate-800">{s.event.actor}</span>
                    <span className="text-slate-400"> · </span>
                    <span className="tabular-nums">{formatDateTime(s.event.at)}</span>
                  </p>
                  {s.event.txId ? (
                    <p className="flex items-center gap-2">
                      <span className="text-slate-400">tx</span>
                      <Hash value={s.event.txId} />
                    </p>
                  ) : (
                    <p className="text-slate-400">off-chain · belum ada transaksi</p>
                  )}
                  {s.event.note && (
                    <p className="border-l-2 border-line pl-3 leading-relaxed text-slate-600">{s.event.note}</p>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    )
  return (
    <ol className="grid grid-cols-4">
      {stages.map((s, i) => (
        <li key={s.key} className="min-w-0 pr-3">
          <div className="flex items-center">
            <StageNode state={s.state} />
            {i < stages.length - 1 && (
              <span className={cx("ml-2 h-0.5 flex-1", s.state === "done" ? "bg-brand" : "bg-slate-200")} />
            )}
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">{s.label}</p>
          <p className="text-xs text-slate-500">{s.stateLabel}</p>
          {s.event && <p className="mt-1 text-xs text-slate-400 tabular-nums">{formatDate(s.event.at)}</p>}
        </li>
      ))}
    </ol>
  )
}
