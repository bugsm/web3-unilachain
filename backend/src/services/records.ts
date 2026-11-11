/*
 * Daftar, detail, antrean, dan aktivitas staf. Gabungan draft aktif (off-chain) + aset ledger (spec frontend §5.2),
 * logika sama dengan buildRecord di frontend/src/api/mock/store.ts.
 */
import type { Queryable } from "../db/pool.js"
import { assets, type LedgerAsset } from "../db/repos/assets.js"
import { drafts, type DraftRow } from "../db/repos/drafts.js"
import { events } from "../db/repos/events.js"
import type { UserRow } from "../db/repos/users.js"
import { facultyOfNpm, type FacultyCode } from "../domain/faculty.js"
import { normalizeName, normalizeNpm, predicateOf } from "../domain/skpi.js"
import { actorFromId } from "../fabric/errors.js"
import { LedgerError } from "../fabric/ledger.js"
import { toApiError } from "../fabric/errors.js"
import { notFound } from "../http/errors.js"
import type { ActivityItem, FieldChange, HistoryAction, HistoryEntry, QueueItem, RecordDetail, RecordFilter, SkpiData, SkpiRecord } from "../types.js"
import { toDraft, type Ctx } from "./context.js"

const scopeOf = (u: UserRow): FacultyCode | null => (u.role === "rektor" ? null : u.faculty)
const inScope = (u: UserRow, npm: string) => u.role === "rektor" || facultyOfNpm(npm) === u.faculty

export function buildRecord(npm: string, draft: DraftRow | null, asset: LedgerAsset | null, lastActivityAt: string): SkpiRecord | null {
  if (!draft && !asset) return null
  if (draft?.type === "PENCATATAN") {
    const d = draft.data!
    const pending = toDraft(draft)
    return {
      npm,
      ...d,
      predicate: predicateOf(d.totalSKP)!,
      facultyCode: draft.facultyCode,
      status: pending.status as "MENUNGGU_DEKAN" | "DITOLAK_DEKAN",
      issuedTimestamp: null,
      rektorTimestamp: null,
      reason: draft.rejectReason,
      pendingDraft: pending,
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
    pendingDraft: draft ? toDraft(draft) : null,
    lastActivityAt,
  }
}

async function recordsInScope(q: Queryable, scope: FacultyCode | null): Promise<SkpiRecord[]> {
  const [all, active] = await Promise.all([assets.list(q, scope), drafts.activeInScope(q, scope)])
  const byNpm = new Map<string, { asset: LedgerAsset | null; draft: DraftRow | null }>()
  for (const a of all) byNpm.set(a.npm, { asset: a, draft: null })
  for (const d of active) byNpm.set(d.npm, { asset: byNpm.get(d.npm)?.asset ?? null, draft: d })
  const last = await events.lastActivity(q, [...byNpm.keys()])
  return [...byNpm]
    .map(([npm, x]) => buildRecord(npm, x.draft, x.asset, last.get(npm) ?? ""))
    .filter((r): r is SkpiRecord => r !== null)
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt) || a.npm.localeCompare(b.npm))
}

const MATCH: Record<RecordFilter, (s: SkpiRecord["status"]) => boolean> = {
  ALL: () => true,
  PENDING: (s) => s === "MENUNGGU_DEKAN" || s === "MENUNGGU_REKTOR",
  AKTIF: (s) => s === "AKTIF",
  DICABUT: (s) => s === "DICABUT",
  DITOLAK: (s) => s === "DITOLAK_DEKAN" || s === "DITOLAK_REKTOR",
}

export async function listRecords(ctx: Ctx, user: UserRow, filter: { status?: string; q?: string }) {
  const status = (filter.status && filter.status in MATCH ? filter.status : "ALL") as RecordFilter
  const q = normalizeName(filter.q ?? "").toLowerCase()
  return (await recordsInScope(ctx.pool, scopeOf(user)))
    .filter((r) => MATCH[status](r.status))
    .filter((r) => !q || `${r.name} ${r.npm} ${r.skpiId}`.toLowerCase().includes(q))
}

const FIELDS: Array<keyof SkpiData> = ["name", "skpiId", "programStudy", "totalSKP"]

interface ChainEntry {
  txId: string
  timestamp: string
  isDelete: boolean
  penandaTangan: string
  data: LedgerAsset | null
}

/** Nama fungsi dari perubahan versi aset (RiwayatSKPI tidak menyebut fungsi). */
function actionOf(prev: LedgerAsset | null, next: LedgerAsset): HistoryAction {
  if (next.status === "MENUNGGU_REKTOR") return "SahkanDekan"
  if (next.status === "DITOLAK_REKTOR") return "TolakRektor"
  if (next.status === "DICABUT") return "CabutSKPI"
  return prev?.status === "MENUNGGU_REKTOR" ? "SahkanRektor" : "PerbaruiSKPI"
}

/** Riwayat ledger (RiwayatSKPI) → entri riwayat dengan aksi, penanda tangan, catatan, dan perubahan field. */
export function ledgerHistory(entries: ChainEntry[], mspId: string): HistoryEntry[] {
  const out: HistoryEntry[] = []
  let prev: LedgerAsset | null = null
  for (const e of entries) {
    if (!e.data) continue
    const action = actionOf(prev, e.data)
    const changes: FieldChange[] =
      action === "PerbaruiSKPI" && prev
        ? FIELDS.filter((f) => String(prev![f]) !== String(e.data![f])).map((f) => ({ field: f, from: String(prev![f]), to: String(e.data![f]) }))
        : []
    out.push({
      kind: "ledger",
      action,
      at: e.timestamp,
      actor: actorFromId(e.penandaTangan, mspId),
      txId: e.txId,
      note: action === "CabutSKPI" || action === "TolakRektor" ? e.data.revocationReason || null : null,
      changes,
    })
    prev = e.data
  }
  return out
}

/**
 * Detail: dekan/rektor membaca ulang ledger (BacaSKPI + RiwayatSKPI) dan menyegarkan proyeksi; admin (tidak boleh
 * memanggil fungsi baca chaincode) memakai proyeksi + peristiwa yang dicatat aplikasi. Bila peer tak terjangkau,
 * staf tetap melihat salinan terakhir.
 */
export async function getRecord(ctx: Ctx, user: UserRow, rawNpm: string): Promise<RecordDetail> {
  const npm = normalizeNpm(rawNpm)
  if (!/^\d{10}$/.test(npm) || !inScope(user, npm)) throw notFound(`SKPI ${npm} tidak ditemukan.`)
  const stored = await events.forNpm(ctx.pool, npm)
  let asset = await assets.get(ctx.pool, npm)
  let ledgerEntries = stored.filter((h) => h.kind === "ledger")

  if (user.fabricIdentity) {
    try {
      const fresh = JSON.parse(await ctx.ledger.evaluate(user.fabricIdentity, "BacaSKPI", [npm])) as LedgerAsset
      const chain = JSON.parse(await ctx.ledger.evaluate(user.fabricIdentity, "RiwayatSKPI", [npm])) as ChainEntry[]
      await assets.upsert(ctx.pool, fresh)
      asset = fresh
      ledgerEntries = ledgerHistory(chain, ctx.config.fabric.mspId)
    } catch (e) {
      const notOnLedger = e instanceof LedgerError && e.kind === "REJECTED" && /tidak ditemukan/.test(e.message)
      const unreachable = e instanceof LedgerError && e.kind !== "REJECTED"
      if (notOnLedger) {
        asset = null
        ledgerEntries = []
      } else if (!unreachable) throw toApiError(e)
    }
  }

  const draft = await drafts.activeFor(ctx.pool, npm)
  const history = [...stored.filter((h) => h.kind === "offchain"), ...ledgerEntries].sort((a, b) => a.at.localeCompare(b.at))
  const record = buildRecord(npm, draft, asset, history.at(-1)?.at ?? "")
  if (!record) throw notFound(`SKPI ${npm} tidak ditemukan.`)
  return { ...record, history }
}

export async function listQueue(ctx: Ctx, user: UserRow): Promise<QueueItem[]> {
  if (user.role === "rektor") {
    return (await recordsInScope(ctx.pool, null))
      .filter((r) => r.status === "MENUNGGU_REKTOR")
      .sort((a, b) => a.lastActivityAt.localeCompare(b.lastActivityAt))
      .map((record) => ({ kind: "rektor" as const, record }))
  }
  const pending = await drafts.listPendingForFaculty(ctx.pool, user.faculty!)
  const last = await events.lastActivity(ctx.pool, pending.map((d) => d.npm))
  const out: QueueItem[] = []
  for (const d of pending) {
    const asset = await assets.get(ctx.pool, d.npm)
    out.push({ kind: "draft", draft: toDraft(d), record: buildRecord(d.npm, d, asset, last.get(d.npm) ?? "") })
  }
  return out
}

export async function activity(ctx: Ctx, user: UserRow, limit: number): Promise<ActivityItem[]> {
  const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 10
  return events.recent(ctx.pool, scopeOf(user), n)
}
