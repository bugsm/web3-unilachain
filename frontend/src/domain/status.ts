import type { DraftType, HistoryAction, RecordStatus } from "@/api/types"

export type Tone = "pending" | "ok" | "revoked" | "muted"

export const STATUS_META: Record<RecordStatus, { label: string; tone: Tone }> = {
  MENUNGGU_DEKAN: { label: "Menunggu Dekan", tone: "pending" },
  DITOLAK_DEKAN: { label: "Ditolak Dekan", tone: "muted" },
  MENUNGGU_REKTOR: { label: "Menunggu Rektor", tone: "pending" },
  AKTIF: { label: "Aktif", tone: "ok" },
  DITOLAK_REKTOR: { label: "Ditolak Rektor", tone: "muted" },
  DICABUT: { label: "Dicabut", tone: "revoked" },
}

export const DRAFT_TYPE_LABEL: Record<DraftType, string> = {
  PENCATATAN: "Pencatatan",
  PERUBAHAN: "Perubahan",
  PENCABUTAN: "Pencabutan",
}

export const ACTION_LABEL: Record<HistoryAction, string> = {
  DIAJUKAN: "Diajukan admin",
  DITOLAK_DEKAN: "Ditolak Dekan",
  SahkanDekan: "Disahkan Dekan",
  SahkanRektor: "Disahkan Rektor",
  TolakRektor: "Ditolak Rektor",
  PerbaruiSKPI: "Data diperbarui",
  CabutSKPI: "Dicabut",
}

export const FIELD_LABEL = {
  name: "Nama lulusan",
  skpiId: "Nomor SKPI",
  programStudy: "Program studi",
  totalSKP: "Total SKP",
} as const
