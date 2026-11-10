/*
 * Kontrak data frontend ↔ backend (spec §6). Backend S4 mengikuti bentuk ini.
 */
import type { FacultyCode } from "@/domain/faculty"
import type { Predicate, SkpiInput } from "@/domain/skpi"

export type { FacultyCode, Predicate, SkpiInput }

export type Role = "admin" | "dekan" | "rektor"

export interface User {
  id: string
  name: string
  role: Role
  /** null untuk rektor (lintas fakultas). */
  faculty: FacultyCode | null
  /** Identitas penanda tangan; admin tidak memegang identitas Fabric. */
  actorId: string
}

export type LedgerStatus = "MENUNGGU_REKTOR" | "AKTIF" | "DITOLAK_REKTOR" | "DICABUT"
export type RecordStatus = "MENUNGGU_DEKAN" | "DITOLAK_DEKAN" | LedgerStatus
export type DraftType = "PENCATATAN" | "PERUBAHAN" | "PENCABUTAN"
export type DraftStatus = "MENUNGGU_DEKAN" | "DITOLAK_DEKAN" | "DISETUJUI"
export type SkpiData = Omit<SkpiInput, "npm">

export interface Draft {
  id: string
  type: DraftType
  status: DraftStatus
  npm: string
  facultyCode: FacultyCode
  /** Data usulan (PENCATATAN/PERUBAHAN); null untuk PENCABUTAN. */
  data: SkpiData | null
  /** Alasan pencabutan (PENCABUTAN). */
  reason: string | null
  /** Alasan penolakan dekan (off-chain). */
  rejectReason: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface SkpiRecord {
  npm: string
  name: string
  skpiId: string
  programStudy: string
  totalSKP: number
  predicate: Predicate
  facultyCode: FacultyCode
  status: RecordStatus
  /** Waktu SahkanDekan; null selama masih draft. */
  issuedTimestamp: string | null
  rektorTimestamp: string | null
  /** Alasan penolakan (dekan/rektor) atau pencabutan; hanya untuk staf. */
  reason: string | null
  /** Draft yang belum diputuskan dekan (MENUNGGU_DEKAN / DITOLAK_DEKAN). */
  pendingDraft: Draft | null
  lastActivityAt: string
}

export type HistoryAction =
  | "DIAJUKAN"
  | "DITOLAK_DEKAN"
  | "SahkanDekan"
  | "SahkanRektor"
  | "TolakRektor"
  | "PerbaruiSKPI"
  | "CabutSKPI"

export interface FieldChange {
  field: keyof SkpiData
  from: string
  to: string
}

export interface HistoryEntry {
  kind: "ledger" | "offchain"
  action: HistoryAction
  at: string
  actor: string
  txId: string | null
  note: string | null
  changes: FieldChange[]
}

export interface RecordDetail extends SkpiRecord {
  /** Urut lama → baru. */
  history: HistoryEntry[]
}

export type QueueItem =
  | { kind: "draft"; draft: Draft; record: SkpiRecord | null }
  | { kind: "rektor"; record: SkpiRecord }

export type RecordFilter = "ALL" | "PENDING" | "AKTIF" | "DICABUT" | "DITOLAK"

export interface ActivityItem {
  npm: string
  name: string
  action: HistoryAction
  kind: "ledger" | "offchain"
  at: string
  txId: string | null
}

export type VerifyStatus = "TERDAFTAR" | "DICABUT" | "BELUM_SAH" | "TIDAK_TERDAFTAR"

/** Persis field dataPublik() di chaincode. */
export interface PublicSkpi {
  npm: string
  name: string
  skpiId: string
  programStudy: string
  totalSKP: number
  predicate: Predicate
  issuer: string
  issuedTimestamp: string
  rektorTimestamp: string
  status: LedgerStatus
}

export interface VerifyResult {
  status: VerifyStatus
  data: PublicSkpi | null
  rektorName: string | null
}

export interface VerifyCandidate {
  npm: string
  name: string
  programStudy: string
  facultyCode: FacultyCode
}

export interface BatchResult {
  created: Draft[]
  errors: { index: number; npm: string; message: string }[]
}

export interface LoginInput {
  identifier: string
  password: string
  role: Role
}

export interface NewDraft {
  type: DraftType
  npm: string
  data?: SkpiData
  reason?: string
}
