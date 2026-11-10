import type { HistoryAction, HistoryEntry, RecordStatus } from "@/api/types"

export type StageState = "done" | "current" | "pending" | "rejected" | "revoked"

export interface Stage {
  key: "admin" | "dekan" | "rektor" | "ledger"
  label: string
  sub: string
  state: StageState
  stateLabel: string
  event?: HistoryEntry
}

const STATE_LABEL: Record<StageState, string> = {
  done: "Ditandatangani",
  current: "Menunggu",
  pending: "Belum",
  rejected: "Ditolak",
  revoked: "Dicabut",
}

function lastIndex(h: HistoryEntry[], actions: HistoryAction[], before = h.length): number {
  for (let i = Math.min(before, h.length) - 1; i >= 0; i--) if (actions.includes(h[i].action)) return i
  return -1
}

/** Rantai pengesahan admin → dekan → rektor → ledger untuk siklus pencatatan terakhir. */
export function custody(status: RecordStatus, history: HistoryEntry[] = []): Stage[] {
  const at = (i: number) => (i >= 0 ? history[i] : undefined)
  const draftStage = status === "MENUNGGU_DEKAN" || status === "DITOLAK_DEKAN"

  // Untuk draft: siklus = pengajuan terakhir. Untuk aset: siklus berawal dari SahkanDekan terakhir.
  const dekanIdx = draftStage ? -1 : lastIndex(history, ["SahkanDekan"])
  const adminIdx = draftStage ? lastIndex(history, ["DIAJUKAN"]) : lastIndex(history, ["DIAJUKAN"], dekanIdx)
  const after = (i: number, actions: HistoryAction[]) => {
    const j = lastIndex(history, actions)
    return j > i ? j : -1
  }

  const dekanState: StageState =
    status === "MENUNGGU_DEKAN" ? "current" : status === "DITOLAK_DEKAN" ? "rejected" : "done"
  const rektorState: StageState =
    status === "MENUNGGU_REKTOR"
      ? "current"
      : status === "DITOLAK_REKTOR"
        ? "rejected"
        : status === "AKTIF" || status === "DICABUT"
          ? "done"
          : "pending"
  const ledgerState: StageState = status === "AKTIF" ? "done" : status === "DICABUT" ? "revoked" : "pending"

  return [
    {
      key: "admin",
      label: "Admin fakultas",
      sub: "Draft off-chain",
      state: "done",
      stateLabel: "Diajukan",
      event: at(adminIdx),
    },
    {
      key: "dekan",
      label: "Dekan",
      sub: "Tanda tangan fakultas",
      state: dekanState,
      stateLabel: STATE_LABEL[dekanState],
      event: dekanState === "rejected" ? at(after(adminIdx, ["DITOLAK_DEKAN"])) : at(dekanIdx),
    },
    {
      key: "rektor",
      label: "Rektor",
      sub: "Pengesahan universitas",
      state: rektorState,
      stateLabel: STATE_LABEL[rektorState],
      event:
        rektorState === "done" || rektorState === "rejected"
          ? at(after(dekanIdx, ["SahkanRektor", "TolakRektor"]))
          : undefined,
    },
    {
      key: "ledger",
      label: "Ledger",
      sub: "Status publik",
      state: ledgerState,
      stateLabel: ledgerState === "done" ? "Aktif" : ledgerState === "revoked" ? "Dicabut" : "Belum aktif",
      event: ledgerState === "revoked" ? at(after(dekanIdx, ["CabutSKPI"])) : undefined,
    },
  ]
}
