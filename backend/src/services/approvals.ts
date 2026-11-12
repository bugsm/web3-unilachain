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
