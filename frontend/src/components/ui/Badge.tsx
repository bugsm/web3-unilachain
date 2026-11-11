import type { ReactNode } from "react"
import type { RecordStatus } from "@/api/types"
import { STATUS_META, type Tone } from "@/domain/status"
import { cx } from "./cx"

export const TONE: Record<Tone, { badge: string; dot: string }> = {
  pending: { badge: "bg-warn-soft text-warn", dot: "bg-warn" },
  ok: { badge: "bg-ok-soft text-ok", dot: "bg-ok" },
  revoked: { badge: "bg-bad-soft text-bad", dot: "bg-bad" },
  muted: { badge: "bg-canvas text-slate-600", dot: "bg-slate-500" },
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap",
        TONE[tone].badge,
      )}
    >
      <span className={cx("size-1.5 rounded-full", TONE[tone].dot)} />
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: RecordStatus }) {
  const m = STATUS_META[status]
  return <Badge tone={m.tone}>{m.label}</Badge>
}

/** Penanda kecil untuk draft perubahan/pencabutan yang menunggu keputusan. */
export function Tag({ children, tone = "pending" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={cx("inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium whitespace-nowrap", TONE[tone].badge)}>
      {children}
    </span>
  )
}
