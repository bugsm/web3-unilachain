/*
 * Persetujuan sebagai transaksi ledger (spec §5.2). Ledger sumber kebenaran: draft hanya DISETUJUI setelah commit valid;
 * status commit yang belum pasti meninggalkan draft MENUNGGU_KONFIRMASI dan ledger_tx PENDING untuk rekonsiliasi.
 */
import { withTx } from "../db/pool.js"
import { assets, type LedgerAsset } from "../db/repos/assets.js"
import { drafts, type DraftRow } from "../db/repos/drafts.js"
import { events } from "../db/repos/events.js"
import { ledgerTx } from "../db/repos/ledgerTx.js"
import type { UserRow } from "../db/repos/users.js"
import { toApiError } from "../fabric/errors.js"
import { LedgerError } from "../fabric/ledger.js"
import { badRequest, conflict, forbidden, notFound } from "../http/errors.js"
import { logger } from "../log.js"
import type { FieldChange, HistoryAction, SkpiData } from "../types.js"
import { assertReason } from "./drafts.js"
import { actorOf, nowIso, toDraft, type Ctx } from "./context.js"

const PENDING_TX = "Transaksi sebelumnya masih menunggu konfirmasi ledger."
const FIELDS: Array<keyof SkpiData> = ["name", "skpiId", "programStudy", "totalSKP"]

/** Fungsi chaincode + argumen untuk sebuah draft. */
export function txFor(d: DraftRow): { fn: HistoryAction; args: string[] } {
  if (d.type === "PENCABUTAN") return { fn: "CabutSKPI", args: [d.npm, d.reason ?? ""] }
  const x = d.data!
  const args = [d.npm, x.name, x.skpiId, x.programStudy, String(x.totalSKP)]
  return { fn: d.type === "PENCATATAN" ? "SahkanDekan" : "PerbaruiSKPI", args }
}

export function diff(before: LedgerAsset | null, after: LedgerAsset): FieldChange[] {
  if (!before) return []
  return FIELDS.filter((f) => String(before[f]) !== String(after[f])).map((f) => ({ field: f, from: String(before[f]), to: String(after[f]) }))
}

/**
 * Catat hasil transaksi yang sudah ter-commit: proyeksi aset, peristiwa ledger, status draft, dan ledger_tx.
 * Dipakai jalur normal dan rekonsiliasi.
 */
export async function recordCommitted(
  ctx: Ctx,
  t: { txId: string; fn: HistoryAction; actor: string; npm: string; asset: LedgerAsset; draftId: string | null; note: string | null },
) {
  await withTx(ctx.pool, async (q) => {
    // Klaim dulu: jalur normal dan rekonsiliasi dapat mencatat transaksi yang sama bersamaan; hanya satu yang menang.
    if (!(await ledgerTx.claimCommitted(q, t.txId, t.npm))) return
    const before = await assets.get(q, t.npm)
    await assets.upsert(q, t.asset)
    const at = nowIso(ctx)
    if (t.draftId) await drafts.update(q, t.draftId, { status: "DISETUJUI", at })
    await events.add(q, t.npm, {
      kind: "ledger",
      action: t.fn,
      at,
      actor: t.actor,
      txId: t.txId,
      note: t.note,
      changes: t.fn === "PerbaruiSKPI" ? diff(before, t.asset) : [],
    })
  })
}

/** Jalankan transaksi; petakan kegagalan. `release` mengembalikan kunci (draft/NPM) bila pasti tidak tercatat. */
async function run(
  ctx: Ctx,
  user: UserRow,
  p: { fn: HistoryAction; args: string[]; npm: string; draftId: string | null; note: string | null; release: () => Promise<void> },
) {
  const identity = user.fabricIdentity!
  let txId: string | null = null
  let res: { txId: string; result: string }
  try {
    res = await ctx.ledger.submit(identity, p.fn, p.args, async (id) => {
      txId = id
      await ledgerTx.begin(ctx.pool, { txId: id, draftId: p.draftId, npm: p.npm, fn: p.fn, identity })
    })
  } catch (e) {
    if (e instanceof LedgerError && e.kind === "COMMIT_UNKNOWN") throw toApiError(e)
    if (txId) await ledgerTx.finish(ctx.pool, txId, "FAILED", e instanceof Error ? e.message : String(e))
    await p.release()
    throw toApiError(e)
  }
  // Sudah ter-commit di ledger: galat setelah ini tidak boleh mengembalikan draft; ledger_tx tetap PENDING
  // sehingga rekonsiliasi mencatatnya.
  await recordCommitted(ctx, {
    txId: res.txId,
    fn: p.fn,
    actor: actorOf(ctx, user),
    npm: p.npm,
    asset: JSON.parse(res.result) as LedgerAsset,
    draftId: p.draftId,
    note: p.note,
  })
  return { txId: res.txId }
}

async function lockPendingDraft(ctx: Ctx, user: UserRow, id: string, next: "MENUNGGU_KONFIRMASI" | null) {
  return withTx(ctx.pool, async (q) => {
    const d = await drafts.lock(q, id)
    if (!d) throw notFound("Draft tidak ditemukan.")
    if (d.facultyCode !== user.faculty) throw forbidden("Draft bukan dari fakultas Anda.")
    if (d.status === "MENUNGGU_KONFIRMASI") throw conflict(PENDING_TX)
    if (d.status !== "MENUNGGU_DEKAN") throw conflict("Draft tidak sedang menunggu Dekan.")
    if (next) await drafts.update(q, d.id, { status: next, at: nowIso(ctx) })
    return d
  })
}

export async function approveDraft(ctx: Ctx, user: UserRow, id: string) {
  const d = await lockPendingDraft(ctx, user, id, "MENUNGGU_KONFIRMASI")
  const { fn, args } = txFor(d)
  return run(ctx, user, {
    fn,
    args,
    npm: d.npm,
    draftId: d.id,
    note: d.type === "PENCABUTAN" ? d.reason : null,
    release: async () => {
      await drafts.update(ctx.pool, d.id, { status: "MENUNGGU_DEKAN" })
    },
  })
}

export async function rejectDraft(ctx: Ctx, user: UserRow, id: string, reason: unknown) {
  const clean = assertReason(reason)
  return toDraft(
    await withTx(ctx.pool, async (q) => {
      const d = await drafts.lock(q, id)
      if (!d) throw notFound("Draft tidak ditemukan.")
      if (d.facultyCode !== user.faculty) throw forbidden("Draft bukan dari fakultas Anda.")
      if (d.status === "MENUNGGU_KONFIRMASI") throw conflict(PENDING_TX)
      if (d.status !== "MENUNGGU_DEKAN") throw conflict("Draft tidak sedang menunggu Dekan.")
      const at = nowIso(ctx)
      const updated = await drafts.update(q, d.id, { status: "DITOLAK_DEKAN", rejectReason: clean, at })
      await events.add(q, d.npm, { kind: "offchain", action: "DITOLAK_DEKAN", at, actor: actorOf(ctx, user), txId: null, note: clean, changes: [] })
      return updated
    }),
  )
}

async function assertRektorTarget(ctx: Ctx, npm: string) {
  if (!/^\d{10}$/.test(npm)) throw badRequest("NPM harus 10 digit angka.")
  if (await ledgerTx.pendingForNpm(ctx.pool, npm)) throw conflict(PENDING_TX)
}

export async function rektorApprove(ctx: Ctx, user: UserRow, npm: string) {
  await assertRektorTarget(ctx, npm)
  return run(ctx, user, { fn: "SahkanRektor", args: [npm], npm, draftId: null, note: null, release: async () => undefined })
}

export async function rektorReject(ctx: Ctx, user: UserRow, npm: string, reason: unknown) {
  const clean = assertReason(reason)
  await assertRektorTarget(ctx, npm)
  return run(ctx, user, { fn: "TolakRektor", args: [npm, clean], npm, draftId: null, note: clean, release: async () => undefined })
}

// --- Pengesahan massal: banyak SKPI dalam SATU transaksi ledger ---
// Chaincode SahkanDekanBatch / SahkanRektorBatch (onchain): satu transaksi memuat 1-100 SKPI, sehingga satu blok berisi sebanyak itu
// metadata tanpa bergantung pada waktu tiba tiap transaksi di orderer. Atomik di chaincode: butir yang salah menolak seluruh transaksi
// dan semua galat dilaporkan sekaligus (BATCH_DITOLAK:[...]); di sini butir itu dibuang lalu sisanya dikirim ulang.

/** Batas item per permintaan = batas chaincode = BatchSize.MaxMessageCount kanal. */
export const MAX_BATCH = 100
/** Percobaan kirim: setelah penolakan chaincode, butir yang salah dibuang dan sisanya dikirim ulang. */
const MAX_ATTEMPTS = 3
const BATCH_REJECTED = "BATCH_DITOLAK:"

export type BatchOutcome =
  | { key: string; ok: true; txId: string }
  | { key: string; ok: false; status: number; code: string; message: string }

interface Prepared {
  key: string
  /** Fungsi tingkat SKPI (SahkanDekan, PerbaruiSKPI, CabutSKPI, SahkanRektor): dicatat di ledger_tx dan peristiwa. */
  fn: HistoryAction
  args: string[]
  npm: string
  draftId: string | null
  note: string | null
  release: () => Promise<void>
  /** Butir untuk fungsi chaincode batch; kosong = tidak dapat ikut batch dan dikirim sebagai transaksi tunggal. */
  item?: unknown
}

function failure(key: string, e: unknown): BatchOutcome {
  const a = toApiError(e)
  return { key, ok: false, status: a.status, code: a.code, message: a.message }
}

function assertKeys(v: unknown, label: string): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== "string")) throw badRequest(`${label} wajib berupa daftar teks, minimal satu.`)
  if (v.length > MAX_BATCH) throw badRequest(`Maksimal ${MAX_BATCH} item per permintaan.`)
  if (new Set(v).size !== v.length) throw badRequest("Daftar berisi item ganda.")
  return v as string[]
}

/** Butir yang ditolak chaincode ([{butir, pesan}], butir dihitung dari 1), atau null bila ini bukan penolakan batch. */
function rejectedItems(e: unknown): Array<{ butir: number; pesan: string }> | null {
  if (!(e instanceof LedgerError) || e.kind !== "REJECTED" || !e.message.startsWith(BATCH_REJECTED)) return null
  try {
    const v: unknown = JSON.parse(e.message.slice(BATCH_REJECTED.length))
    return Array.isArray(v) ? (v as Array<{ butir: number; pesan: string }>) : null
  } catch {
    return null
  }
}

type Slot = { slot: number; p: Prepared }

/** Kirim butir-butir sebagai satu transaksi batch; hasil per butir. Tidak pernah melempar. */
async function submitBatchTx(ctx: Ctx, user: UserRow, batchFn: "SahkanDekanBatch" | "SahkanRektorBatch", items: Slot[]): Promise<Array<[number, BatchOutcome]>> {
  const identity = user.fabricIdentity!
  const out: Array<[number, BatchOutcome]> = []
  const failAll = async (rest: Slot[], e: unknown, txId: string | null) => {
    if (txId) await ledgerTx.finish(ctx.pool, txId, "FAILED", e instanceof Error ? e.message : String(e))
    for (const { slot, p } of rest) {
      await p.release()
      out.push([slot, failure(p.key, e)])
    }
  }

  let remaining = items
  for (let attempt = 1; remaining.length > 0 && attempt <= MAX_ATTEMPTS; attempt++) {
    const sending = remaining
    let txId: string | null = null
    try {
      const res = await ctx.ledger.submit(identity, batchFn, [JSON.stringify(sending.map(({ p }) => p.item))], async (id) => {
        txId = id
        await ledgerTx.beginMany(ctx.pool, { txId: id, identity, items: sending.map(({ p }) => ({ npm: p.npm, draftId: p.draftId, fn: p.fn })) })
      })
      const assets = JSON.parse(res.result) as LedgerAsset[]
      await Promise.all(
        sending.map(async ({ slot, p }, i) => {
          // Sudah ter-commit: galat pencatatan tidak boleh mengembalikan draft; baris ledger_tx tetap PENDING sehingga rekonsiliasi mencatatnya.
          try {
            await recordCommitted(ctx, { txId: res.txId, fn: p.fn, actor: actorOf(ctx, user), npm: p.npm, asset: assets[i], draftId: p.draftId, note: p.note })
          } catch (err) {
            logger.error({ err, txId: res.txId, npm: p.npm }, "pencatatan hasil batch gagal; menunggu rekonsiliasi")
          }
          out.push([slot, { key: p.key, ok: true, txId: res.txId }])
        }),
      )
      return out
    } catch (e) {
      // Status commit belum pasti: seluruh batch tetap menunggu (baris ledger_tx PENDING, draft MENUNGGU_KONFIRMASI) untuk rekonsiliasi.
      if (e instanceof LedgerError && e.kind === "COMMIT_UNKNOWN") {
        for (const { slot, p } of sending) out.push([slot, failure(p.key, e)])
        return out
      }
      const bad = rejectedItems(e)
      const drop = new Set<number>()
      for (const { butir, pesan } of bad ?? []) {
        const r = sending[butir - 1]
        if (!r || drop.has(butir - 1)) continue
        drop.add(butir - 1)
        await r.p.release()
        out.push([r.slot, failure(r.p.key, new LedgerError("REJECTED", pesan))])
      }
      if (drop.size === 0) {
        // Penolakan tingkat transaksi (peran, konflik MVCC, peer mati, galat ledger): semua butir yang tersisa ikut gagal.
        await failAll(sending, e, txId)
        return out
      }
      remaining = sending.filter((_, i) => !drop.has(i))
    }
  }
  if (remaining.length > 0) await failAll(remaining, new LedgerError("REJECTED", "MVCC_READ_CONFLICT"), null)
  return out
}

/**
 * Siapkan tiap item sendiri (kunci draft / pemeriksaan NPM) sehingga yang bermasalah hanya gagal sendiri. Yang lolos dan dapat ikut batch
 * dikirim sebagai SATU transaksi; sisanya (mis. perubahan dan pencabutan, yang fungsi chaincode-nya tidak punya versi batch) sebagai
 * transaksi tunggal. Aturan pencatatan sama dengan `run`: ter-commit -> proyeksi; pasti gagal -> draft dikembalikan; belum pasti -> PENDING.
 */
async function runBatchApproval(
  ctx: Ctx,
  user: UserRow,
  batchFn: "SahkanDekanBatch" | "SahkanRektorBatch",
  entries: Array<{ key: string; prepare: () => Promise<Prepared> }>,
): Promise<BatchOutcome[]> {
  const outcomes = new Array<BatchOutcome>(entries.length)
  const inBatch: Slot[] = []
  const alone: Slot[] = []
  for (const [slot, e] of entries.entries()) {
    try {
      const p = await e.prepare()
      ;(p.item === undefined ? alone : inBatch).push({ slot, p })
    } catch (err) {
      outcomes[slot] = failure(e.key, err)
    }
  }
  await Promise.all([
    inBatch.length > 0
      ? submitBatchTx(ctx, user, batchFn, inBatch).then((rs) => rs.forEach(([slot, o]) => (outcomes[slot] = o)))
      : Promise.resolve(),
    ...alone.map(async ({ slot, p }) => {
      try {
        outcomes[slot] = { key: p.key, ok: true, ...(await run(ctx, user, p)) }
      } catch (err) {
        outcomes[slot] = failure(p.key, err)
      }
    }),
  ])
  return outcomes
}

export function approveDraftsBatch(ctx: Ctx, user: UserRow, ids: unknown) {
  const list = assertKeys(ids, "Daftar draft")
  return runBatchApproval(
    ctx,
    user,
    "SahkanDekanBatch",
    list.map((id) => ({
      key: id,
      prepare: async () => {
        const d = await lockPendingDraft(ctx, user, id, "MENUNGGU_KONFIRMASI")
        const { fn, args } = txFor(d)
        const x = d.data
        return {
          key: id,
          fn,
          args,
          npm: d.npm,
          draftId: d.id,
          note: d.type === "PENCABUTAN" ? d.reason : null,
          release: async () => {
            await drafts.update(ctx.pool, d.id, { status: "MENUNGGU_DEKAN" })
          },
          // Hanya pencatatan baru (SahkanDekan) yang punya fungsi batch.
          item: d.type === "PENCATATAN" && x ? { npm: d.npm, name: x.name, skpiId: x.skpiId, programStudy: x.programStudy, totalSKP: x.totalSKP } : undefined,
        }
      },
    })),
  )
}

export function rektorApproveBatch(ctx: Ctx, user: UserRow, npms: unknown) {
  const list = assertKeys(npms, "Daftar NPM")
  return runBatchApproval(
    ctx,
    user,
    "SahkanRektorBatch",
    list.map((npm) => ({
      key: npm,
      prepare: async () => {
        await assertRektorTarget(ctx, npm)
        return { key: npm, fn: "SahkanRektor" as const, args: [npm], npm, draftId: null, note: null, release: async () => undefined, item: npm }
      },
    })),
  )
}
