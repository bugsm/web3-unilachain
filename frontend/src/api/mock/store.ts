/*
 * Penyimpanan in-memory yang meniru basis data off-chain + world state ledger.
 * Aturan tulis meniru chaincode (desain-alur-pengesahan.md §5) agar layar dapat diuji sebelum backend ada.
 */
import { facultyOfNpm, type FacultyCode } from "@/domain/faculty"
import { normalizeName, predicateOf, toForm, validateReason, validateSkpi, type Predicate, type SkpiInput } from "@/domain/skpi"
import { ApiError } from "../errors"
import type {
  Draft,
  FieldChange,
  HistoryAction,
  HistoryEntry,
  LedgerStatus,
  NewDraft,
  SkpiData,
  SkpiRecord,
} from "../types"

export interface Asset extends SkpiInput {
  predicate: Predicate
  facultyCode: FacultyCode
  issuer: string
  issuedTimestamp: string
  status: LedgerStatus
  dekanId: string
  rektorId: string
  rektorTimestamp: string
  updatedTimestamp: string
  revocationReason: string
}

export interface Store {
  drafts: Map<string, Draft>
  assets: Map<string, Asset>
  history: Map<string, HistoryEntry[]>
  /** skpiId → npm (indeks chaincode skpiId~npm). */
  skpiIndex: Map<string, string>
  seq: number
}

export const createStore = (): Store => ({
  drafts: new Map(),
  assets: new Map(),
  history: new Map(),
  skpiIndex: new Map(),
  seq: 0,
})

const PENDING = new Set(["MENUNGGU_DEKAN", "DITOLAK_DEKAN"])
const FIELDS: Array<keyof SkpiData> = ["name", "skpiId", "programStudy", "totalSKP"]

export function txId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

function log(s: Store, npm: string, entry: Omit<HistoryEntry, "changes"> & { changes?: FieldChange[] }) {
  const list = s.history.get(npm) ?? []
  list.push({ changes: [], ...entry })
  s.history.set(npm, list)
}

export function activeDraft(s: Store, npm: string): Draft | null {
  let found: Draft | null = null
  for (const d of s.drafts.values()) if (d.npm === npm && PENDING.has(d.status)) found = d
  return found
}

function assertNpmFaculty(npm: string, faculty: FacultyCode) {
  if (!/^\d{10}$/.test(npm)) throw new ApiError(400, "VALIDATION", "NPM harus 10 digit angka.")
  if (facultyOfNpm(npm) !== faculty)
    throw new ApiError(403, "FORBIDDEN", `NPM ${npm} bukan mahasiswa ${faculty}.`)
}

function assertData(npm: string, data: SkpiData | undefined | null, faculty: FacultyCode): SkpiData {
  if (!data) throw new ApiError(400, "VALIDATION", "Data SKPI wajib diisi.")
  const errors = validateSkpi(toForm({ npm, ...data }), faculty)
  const first = Object.values(errors)[0]
  if (first) throw new ApiError(400, "VALIDATION", first)
  return { ...data, name: normalizeName(data.name), skpiId: data.skpiId.trim() }
}

function assertSkpiIdFree(s: Store, skpiId: string, npm: string, ignoreDraft?: string) {
  const owner = s.skpiIndex.get(skpiId)
  const inDraft = [...s.drafts.values()].some(
    (d) => d.id !== ignoreDraft && d.npm !== npm && PENDING.has(d.status) && d.data?.skpiId === skpiId,
  )
  if ((owner && owner !== npm) || inDraft)
    throw new ApiError(409, "CONFLICT", "Nomor SKPI sudah dipakai SKPI lain.")
}

function assertNoActiveDraft(s: Store, npm: string) {
  if (activeDraft(s, npm))
    throw new ApiError(409, "CONFLICT", `NPM ${npm} sudah memiliki draft yang belum diputuskan.`)
}

function assertCanRegister(s: Store, npm: string) {
  const asset = s.assets.get(npm)
  if (asset && asset.status !== "DICABUT" && asset.status !== "DITOLAK_REKTOR")
    throw new ApiError(409, "CONFLICT", `NPM ${npm} sudah memiliki SKPI berstatus ${asset.status}.`)
}

function assertActive(s: Store, npm: string): Asset {
  const asset = s.assets.get(npm)
  if (!asset) throw new ApiError(404, "NOT_FOUND", `SKPI ${npm} tidak ditemukan.`)
  if (asset.status !== "AKTIF")
    throw new ApiError(409, "CONFLICT", `SKPI ${npm} berstatus ${asset.status}, bukan AKTIF.`)
  return asset
}

const NOTE: Record<NewDraft["type"], string> = {
  PENCATATAN: "Draft pencatatan",
  PERUBAHAN: "Draft perubahan",
  PENCABUTAN: "Draft pencabutan",
}

export function submitDraft(s: Store, input: NewDraft, actor: string, faculty: FacultyCode, at: string): Draft {
  assertNpmFaculty(input.npm, faculty)
  let data: SkpiData | null = null
  let reason: string | null = null
  if (input.type === "PENCABUTAN") {
    assertActive(s, input.npm)
    const err = validateReason(input.reason ?? "")
    if (err) throw new ApiError(400, "VALIDATION", err)
    reason = input.reason!.trim()
  } else {
    data = assertData(input.npm, input.data, faculty)
    if (input.type === "PENCATATAN") assertCanRegister(s, input.npm)
    else assertActive(s, input.npm)
  }
  assertNoActiveDraft(s, input.npm)
  if (data) assertSkpiIdFree(s, data.skpiId, input.npm)

  const draft: Draft = {
    id: `d${++s.seq}`,
    type: input.type,
    status: "MENUNGGU_DEKAN",
    npm: input.npm,
    facultyCode: faculty,
    data,
    reason,
    rejectReason: null,
    createdBy: actor,
    createdAt: at,
    updatedAt: at,
  }
  s.drafts.set(draft.id, draft)
  log(s, input.npm, {
    kind: "offchain",
    action: "DIAJUKAN",
    at,
    actor,
    txId: null,
    note: reason ? `${NOTE[input.type]}: ${reason}` : NOTE[input.type],
  })
  return draft
}

export function findDraft(s: Store, id: string): Draft {
  const d = s.drafts.get(id)
  if (!d) throw new ApiError(404, "NOT_FOUND", "Draft tidak ditemukan.")
  return d
}

export function resubmitDraft(s: Store, id: string, data: SkpiData, actor: string, faculty: FacultyCode, at: string) {
  const d = findDraft(s, id)
  assertNpmFaculty(d.npm, faculty)
  if (d.status !== "DITOLAK_DEKAN" || d.type === "PENCABUTAN")
    throw new ApiError(409, "CONFLICT", "Hanya draft yang ditolak Dekan yang dapat diperbaiki.")
  const clean = assertData(d.npm, data, faculty)
  assertSkpiIdFree(s, clean.skpiId, d.npm, d.id)
  Object.assign(d, { data: clean, status: "MENUNGGU_DEKAN", rejectReason: null, updatedAt: at })
  log(s, d.npm, { kind: "offchain", action: "DIAJUKAN", at, actor, txId: null, note: "Diajukan ulang setelah perbaikan" })
  return d
}

export function rejectDraft(s: Store, id: string, reason: string, actor: string, at: string) {
  const d = findDraft(s, id)
  if (d.status !== "MENUNGGU_DEKAN") throw new ApiError(409, "CONFLICT", "Draft tidak sedang menunggu Dekan.")
  const err = validateReason(reason)
  if (err) throw new ApiError(400, "VALIDATION", err)
  Object.assign(d, { status: "DITOLAK_DEKAN", rejectReason: reason.trim(), updatedAt: at })
  log(s, d.npm, { kind: "offchain", action: "DITOLAK_DEKAN", at, actor, txId: null, note: reason.trim() })
  return d
}

/** Persetujuan dekan = satu transaksi (SahkanDekan / PerbaruiSKPI / CabutSKPI). */
export function approveDraft(s: Store, id: string, actor: string, issuer: string, at: string): string {
  const d = findDraft(s, id)
  if (d.status !== "MENUNGGU_DEKAN") throw new ApiError(409, "CONFLICT", "Draft tidak sedang menunggu Dekan.")
  const tx = txId()
  let action: HistoryAction
  let changes: FieldChange[] = []
  let note: string | null = null

  if (d.type === "PENCATATAN") {
    assertCanRegister(s, d.npm)
    assertSkpiIdFree(s, d.data!.skpiId, d.npm, d.id)
    s.assets.set(d.npm, {
      npm: d.npm,
      ...d.data!,
      predicate: predicateOf(d.data!.totalSKP)!,
      facultyCode: d.facultyCode,
      issuer,
      issuedTimestamp: at,
      status: "MENUNGGU_REKTOR",
      dekanId: actor,
      rektorId: "",
      rektorTimestamp: "",
      updatedTimestamp: "",
      revocationReason: "",
    })
    s.skpiIndex.set(d.data!.skpiId, d.npm)
    action = "SahkanDekan"
  } else if (d.type === "PERUBAHAN") {
    const asset = assertActive(s, d.npm)
    assertSkpiIdFree(s, d.data!.skpiId, d.npm, d.id)
    changes = FIELDS.filter((f) => String(asset[f]) !== String(d.data![f])).map((f) => ({
      field: f,
      from: String(asset[f]),
      to: String(d.data![f]),
    }))
    if (asset.skpiId !== d.data!.skpiId) {
      s.skpiIndex.delete(asset.skpiId)
      s.skpiIndex.set(d.data!.skpiId, d.npm)
    }
    Object.assign(asset, d.data, {
      predicate: predicateOf(d.data!.totalSKP)!,
      dekanId: actor,
      updatedTimestamp: at,
    })
    action = "PerbaruiSKPI"
  } else {
    const asset = assertActive(s, d.npm)
    s.skpiIndex.delete(asset.skpiId)
    Object.assign(asset, { status: "DICABUT", dekanId: actor, revocationReason: d.reason })
    action = "CabutSKPI"
    note = d.reason
  }

  Object.assign(d, { status: "DISETUJUI", updatedAt: at })
  log(s, d.npm, { kind: "ledger", action, at, actor, txId: tx, note, changes })
  return tx
}

function awaitingRektor(s: Store, npm: string): Asset {
  const asset = s.assets.get(npm)
  if (!asset) throw new ApiError(404, "NOT_FOUND", `SKPI ${npm} tidak ditemukan.`)
  if (asset.status !== "MENUNGGU_REKTOR")
    throw new ApiError(409, "CONFLICT", `SKPI ${npm} tidak sedang menunggu Rektor.`)
  return asset
}

export function rektorApprove(s: Store, npm: string, actor: string, at: string): string {
  const asset = awaitingRektor(s, npm)
  Object.assign(asset, { status: "AKTIF", rektorId: actor, rektorTimestamp: at })
  const tx = txId()
  log(s, npm, { kind: "ledger", action: "SahkanRektor", at, actor, txId: tx, note: null })
  return tx
}

export function rektorReject(s: Store, npm: string, reason: string, actor: string, at: string): string {
  const err = validateReason(reason)
  if (err) throw new ApiError(400, "VALIDATION", err)
  const asset = awaitingRektor(s, npm)
  s.skpiIndex.delete(asset.skpiId)
  Object.assign(asset, { status: "DITOLAK_REKTOR", rektorId: actor, rektorTimestamp: at, revocationReason: reason.trim() })
  const tx = txId()
  log(s, npm, { kind: "ledger", action: "TolakRektor", at, actor, txId: tx, note: reason.trim() })
  return tx
}

export function allNpms(s: Store): string[] {
  const set = new Set<string>(s.assets.keys())
  for (const d of s.drafts.values()) set.add(d.npm)
  return [...set]
}

/** Gabungan draft tertunda + aset ledger menjadi satu baris tampilan (spec §5.2). */
export function buildRecord(s: Store, npm: string): SkpiRecord | null {
  const draft = activeDraft(s, npm)
  const asset = s.assets.get(npm) ?? null
  if (!draft && !asset) return null
  const history = s.history.get(npm) ?? []
  const lastActivityAt = history[history.length - 1]?.at ?? ""

  if (draft?.type === "PENCATATAN") {
    const data = draft.data!
    return {
      npm,
      ...data,
      predicate: predicateOf(data.totalSKP)!,
      facultyCode: draft.facultyCode,
      status: draft.status as "MENUNGGU_DEKAN" | "DITOLAK_DEKAN",
      issuedTimestamp: null,
      rektorTimestamp: null,
      reason: draft.rejectReason,
      pendingDraft: { ...draft },
      lastActivityAt,
    }
  }
  const a = asset!
  return {
    npm,
    name: a.name,
    skpiId: a.skpiId,
    programStudy: a.programStudy,
    totalSKP: a.totalSKP,
    predicate: a.predicate,
    facultyCode: a.facultyCode,
    status: a.status,
    issuedTimestamp: a.issuedTimestamp,
    rektorTimestamp: a.rektorTimestamp || null,
    reason: a.status === "DICABUT" || a.status === "DITOLAK_REKTOR" ? a.revocationReason : null,
    pendingDraft: draft ? { ...draft } : null,
    lastActivityAt,
  }
}
