import type { ReactNode } from "react"
import type { RecordStatus } from "@/api/types"
import { STATUS_META, type Tone } from "@/domain/status"
import { cx } from "./cx"

export const TONE: Record<Tone, { badge: string; dot: string }> = {
  pending: { badge: "bg-[#FEF3C7] text-[#B45309]", dot: "bg-[#D97706]" },
  ok: { badge: "bg-[#D1FAE5] text-[#047857]", dot: "bg-[#059669]" },
  revoked: { badge: "bg-[#FFE4E6] text-[#BE123C]", dot: "bg-[#E11D48]" },
  muted: { badge: "bg-[#F1F5F9] text-[#475569]", dot: "bg-[#64748B]" },
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap",
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
