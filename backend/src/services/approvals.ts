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
    if (!(await ledgerTx.claimCommitted(q, t.txId))) return
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

// --- Pengesahan massal: banyak SKPI dalam satu blok ---

/** Batas item per permintaan; aplikasi mengirim 12 per permintaan (satu blok), batas server memberi kelonggaran. */
export const MAX_BATCH = 25

export type BatchOutcome =
  | { key: string; ok: true; txId: string }
  | { key: string; ok: false; status: number; code: string; message: string }

interface Prepared {
  key: string
  fn: HistoryAction
  args: string[]
  npm: string
  draftId: string | null
  note: string | null
  release: () => Promise<void>
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

/**
 * Kirim banyak transaksi sekaligus. Tiap item disiapkan sendiri (kunci draft / pemeriksaan NPM) sehingga yang bermasalah hanya
 * gagal sendiri; sisanya di-endorse paralel lalu dikirim serentak ke orderer agar masuk blok yang sama (fabric/batch.ts).
 * Aturan pencatatan sama dengan transaksi tunggal (`run`): ter-commit → proyeksi; pasti gagal → draft dikembalikan;
 * status commit belum pasti → ledger_tx PENDING dan draft MENUNGGU_KONFIRMASI untuk rekonsiliasi.
 */
async function runBatchApproval(
  ctx: Ctx,
  user: UserRow,
  entries: Array<{ key: string; prepare: () => Promise<Prepared> }>,
): Promise<BatchOutcome[]> {
  const identity = user.fabricIdentity!
  const outcomes = new Array<BatchOutcome>(entries.length)
  const prepared: Array<{ slot: number; p: Prepared }> = []
  for (const [slot, e] of entries.entries()) {
    try {
      prepared.push({ slot, p: await e.prepare() })
    } catch (err) {
      outcomes[slot] = failure(e.key, err)
    }
  }
  if (prepared.length === 0) return outcomes

  const txIds = new Map<number, string>()
  let results: Awaited<ReturnType<typeof ctx.ledger.submitBatch>>
  try {
    results = await ctx.ledger.submitBatch(
      identity,
      prepared.map(({ p }) => ({ fn: p.fn, args: p.args })),
      async (index, txId) => {
        txIds.set(index, txId)
        const { p } = prepared[index]
        await ledgerTx.begin(ctx.pool, { txId, draftId: p.draftId, npm: p.npm, fn: p.fn, identity })
      },
    )
  } catch (err) {
    // submitBatch tidak seharusnya melempar; bila terjadi, hasil yang sudah terkirim tidak diketahui.
    logger.error({ err }, "submitBatch melempar galat")
    results = prepared.map((_, i) => ({
      ok: false as const,
      error: txIds.has(i) ? new LedgerError("COMMIT_UNKNOWN", "submitBatch gagal", txIds.get(i)) : new LedgerError("ERROR", "submitBatch gagal"),
    }))
  }

  await Promise.all(
    prepared.map(async ({ slot, p }, i) => {
      const r = results[i]
      if (r.ok) {
        // Sudah ter-commit: galat pencatatan tidak boleh mengembalikan draft; ledger_tx tetap PENDING sehingga rekonsiliasi mencatatnya.
        try {
          await recordCommitted(ctx, {
            txId: r.txId,
            fn: p.fn,
            actor: actorOf(ctx, user),
            npm: p.npm,
            asset: JSON.parse(r.result) as LedgerAsset,
            draftId: p.draftId,
            note: p.note,
          })
        } catch (err) {
          logger.error({ err, txId: r.txId }, "pencatatan hasil batch gagal; menunggu rekonsiliasi")
        }
        outcomes[slot] = { key: p.key, ok: true, txId: r.txId }
        return
      }
      if (!(r.error instanceof LedgerError && r.error.kind === "COMMIT_UNKNOWN")) {
        const txId = txIds.get(i)
        if (txId) await ledgerTx.finish(ctx.pool, txId, "FAILED", r.error.message)
        await p.release()
      }
      outcomes[slot] = failure(p.key, r.error)
    }),
  )
  return outcomes
}

export function approveDraftsBatch(ctx: Ctx, user: UserRow, ids: unknown) {
  const list = assertKeys(ids, "Daftar draft")
  return runBatchApproval(
    ctx,
    user,
    list.map((id) => ({
      key: id,
      prepare: async () => {
        const d = await lockPendingDraft(ctx, user, id, "MENUNGGU_KONFIRMASI")
        const { fn, args } = txFor(d)
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
    list.map((npm) => ({
      key: npm,
      prepare: async () => {
        await assertRektorTarget(ctx, npm)
        return { key: npm, fn: "SahkanRektor" as const, args: [npm], npm, draftId: null, note: null, release: async () => undefined }
      },
    })),
  )
}
