/*
 * Rekonsiliasi (spec §5.2 langkah 6): menyelesaikan transaksi yang status commit-nya belum pasti.
 * Ledger penentu: COMMITTED → dicatat seperti jalur normal; INVALID → dilepas; tak dikenal ledger melewati batas
 * waktu → dianggap tidak pernah sampai orderer. Draft MENUNGGU_KONFIRMASI tanpa transaksi tercatat juga dilepas.
 */
import { drafts } from "../db/repos/drafts.js"
import { ledgerTx, type LedgerTxRow } from "../db/repos/ledgerTx.js"
import type { LedgerAsset } from "../db/repos/assets.js"
import { LedgerError } from "../fabric/ledger.js"
import { logger } from "../log.js"
import type { HistoryAction } from "../types.js"
import { recordCommitted } from "./approvals.js"
import type { Ctx } from "./context.js"

/** Batas umur draft MENUNGGU_KONFIRMASI tanpa transaksi tercatat (jauh di atas batas waktu endorse). */
const ORPHAN_MS = 2 * 60_000

export interface ReconcileResult {
  committed: number
  failed: number
  unknown: number
  released: number
}

async function release(ctx: Ctx, tx: LedgerTxRow, reason: string) {
  await ledgerTx.finish(ctx.pool, tx.txId, "FAILED", reason)
  if (tx.draftId) {
    const d = await drafts.get(ctx.pool, tx.draftId)
    if (d?.status === "MENUNGGU_KONFIRMASI") await drafts.update(ctx.pool, d.id, { status: "MENUNGGU_DEKAN" })
  }
}

export async function reconcileOnce(ctx: Ctx): Promise<ReconcileResult> {
  const out: ReconcileResult = { committed: 0, failed: 0, unknown: 0, released: 0 }
  const now = ctx.now().getTime()

  for (const tx of await ledgerTx.pending(ctx.pool)) {
    let status: "COMMITTED" | "INVALID" | "UNKNOWN"
    try {
      status = await ctx.ledger.txStatus(tx.txId)
    } catch (e) {
      if (e instanceof LedgerError && e.kind === "UNAVAILABLE") {
        out.unknown++
        continue
      }
      throw e
    }

    if (status === "COMMITTED") {
      const asset = JSON.parse(await ctx.ledger.evaluate(tx.identity, "BacaSKPI", [tx.npm])) as LedgerAsset
      const fn = tx.fn as HistoryAction
      await recordCommitted(ctx, {
        txId: tx.txId,
        fn,
        actor: `${tx.identity}@${ctx.config.fabric.mspId}`,
        npm: tx.npm,
        asset,
        draftId: tx.draftId,
        note: fn === "CabutSKPI" || fn === "TolakRektor" ? asset.revocationReason || null : null,
      })
      out.committed++
    } else if (status === "INVALID") {
      await release(ctx, tx, "Transaksi tidak valid menurut ledger")
      out.failed++
    } else if (now - Date.parse(tx.createdAt) > ctx.config.reconcileGiveUpMs) {
      await release(ctx, tx, "Transaksi tidak pernah tercatat di ledger")
      out.failed++
    } else out.unknown++
  }

  for (const d of await drafts.orphanedConfirming(ctx.pool, new Date(now - ORPHAN_MS).toISOString())) {
    await drafts.update(ctx.pool, d.id, { status: "MENUNGGU_DEKAN" })
    out.released++
  }
  return out
}

/** Jalankan berkala; galat dicatat, tidak menghentikan server. */
export function startReconciler(ctx: Ctx): () => void {
  let running = false
  const timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      const r = await reconcileOnce(ctx)
      if (r.committed || r.failed || r.released) logger.info(r, "rekonsiliasi transaksi")
    } catch (err) {
      logger.error({ err }, "rekonsiliasi gagal")
    } finally {
      running = false
    }
  }, ctx.config.reconcileIntervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
