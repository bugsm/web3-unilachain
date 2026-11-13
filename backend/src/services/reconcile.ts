/*
 * Rekonsiliasi (spec §5.2 langkah 6): menyelesaikan transaksi yang status commit-nya belum pasti.
 * Ledger penentu:
 *  - COMMITTED → dicatat seperti jalur normal (pencatatan idempoten, lihat recordCommitted).
 *  - INVALID → dilepas.
 *  - tak dikenal peer melewati batas waktu → sebelum dilepas, periksa apakah efeknya sudah ada di world state
 *    (peer bisa tertinggal blok setelah mati lama); bila ada, dicatat sebagai ter-commit.
 * Transaksi yang lebih muda dari batas waktu jalur normal tidak disentuh. Draft MENUNGGU_KONFIRMASI tanpa transaksi
 * tercatat (proses mati sebelum kirim) juga dilepas.
 */
import type { LedgerAsset } from "../db/repos/assets.js"
import { drafts, type DraftRow } from "../db/repos/drafts.js"
import { ledgerTx, type LedgerTxRow } from "../db/repos/ledgerTx.js"
import { LedgerError } from "../fabric/ledger.js"
import { logger } from "../log.js"
import type { HistoryAction } from "../types.js"
import { recordCommitted } from "./approvals.js"
import type { Ctx } from "./context.js"

/** Batas umur draft MENUNGGU_KONFIRMASI tanpa transaksi tercatat (jauh di atas batas waktu endorse). */
const ORPHAN_MS = 2 * 60_000
/** Baris yang diselesaikan bersamaan; tiap baris memakai satu koneksi DB sebentar (pool 10). */
const CONCURRENCY = 8
/** Toleransi selisih timestamp transaksi (dibuat klien sebelum endorse) terhadap created_at ledger_tx. */
const SKEW_MS = 5 * 60_000

export interface ReconcileResult {
  committed: number
  failed: number
  unknown: number
  released: number
}

async function release(ctx: Ctx, tx: LedgerTxRow, reason: string) {
  await ledgerTx.finish(ctx.pool, tx.txId, "FAILED", reason, tx.npm)
  if (tx.draftId) {
    const d = await drafts.get(ctx.pool, tx.draftId)
    if (d?.status === "MENUNGGU_KONFIRMASI") await drafts.update(ctx.pool, d.id, { status: "MENUNGGU_DEKAN" })
  }
}

const after = (iso: string | undefined, created: number) => !!iso && Date.parse(iso) >= created - SKEW_MS

/** Apakah world state sudah memuat efek transaksi ini (dibandingkan dengan isi draft / fungsi rektor). */
export function effectApplied(tx: LedgerTxRow, asset: LedgerAsset | null, draft: DraftRow | null): boolean {
  if (!asset) return false
  const created = Date.parse(tx.createdAt)
  const d = draft?.data
  switch (tx.fn as HistoryAction) {
    case "SahkanDekan":
      return !!d && asset.skpiId === d.skpiId && after(asset.issuedTimestamp, created)
    case "PerbaruiSKPI":
      return (
        !!d && after(asset.updatedTimestamp, created) && asset.name === d.name && asset.skpiId === d.skpiId &&
        asset.programStudy === d.programStudy && Number(asset.totalSKP) === Number(d.totalSKP)
      )
    case "CabutSKPI":
      return asset.status === "DICABUT" && asset.revocationReason === (draft?.reason ?? "")
    case "SahkanRektor":
      return asset.status !== "DITOLAK_REKTOR" && asset.status !== "MENUNGGU_REKTOR" && after(asset.rektorTimestamp, created)
    case "TolakRektor":
      return asset.status === "DITOLAK_REKTOR" && after(asset.rektorTimestamp, created)
    default:
      return false
  }
}

async function readAsset(ctx: Ctx, tx: LedgerTxRow): Promise<LedgerAsset | null> {
  try {
    return JSON.parse(await ctx.ledger.evaluate(tx.identity, "BacaSKPI", [tx.npm])) as LedgerAsset
  } catch (e) {
    if (e instanceof LedgerError && e.kind === "REJECTED" && /tidak ditemukan/.test(e.message)) return null
    throw e
  }
}

async function commit(ctx: Ctx, tx: LedgerTxRow, asset: LedgerAsset) {
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
}

type TxStatus = Awaited<ReturnType<Ctx["ledger"]["txStatus"]>>

/** Selesaikan satu baris (satu SKPI); kembalikan kategori hasil. Peer tak terjangkau → "unknown" (dicoba lagi nanti). */
async function settle(ctx: Ctx, tx: LedgerTxRow, now: number, statusOf: (txId: string) => Promise<TxStatus>): Promise<keyof Omit<ReconcileResult, "released">> {
  const status = await statusOf(tx.txId)
  if (status === "COMMITTED") {
    const asset = await readAsset(ctx, tx)
    if (!asset) throw new Error(`transaksi ${tx.txId} ter-commit tetapi aset ${tx.npm} tidak ditemukan`)
    await commit(ctx, tx, asset)
    return "committed"
  }
  if (status === "INVALID") {
    await release(ctx, tx, "Transaksi tidak valid menurut ledger")
    return "failed"
  }
  if (now - Date.parse(tx.createdAt) <= ctx.config.reconcileGiveUpMs) return "unknown"
  const draft = tx.draftId ? await drafts.get(ctx.pool, tx.draftId) : null
  const asset = await readAsset(ctx, tx)
  if (effectApplied(tx, asset, draft)) {
    await commit(ctx, tx, asset!)
    return "committed"
  }
  await release(ctx, tx, "Transaksi tidak pernah tercatat di ledger")
  return "failed"
}

export async function reconcileOnce(ctx: Ctx): Promise<ReconcileResult> {
  const out: ReconcileResult = { committed: 0, failed: 0, unknown: 0, released: 0 }
  const now = ctx.now().getTime()
  const t = ctx.config.fabric.timeouts
  // Lebih muda dari total batas waktu jalur normal (+30 s): mungkin masih ditunggu permintaan HTTP-nya.
  const inFlight = t.endorseMs + t.submitMs + t.commitMs + 30_000

  // Transaksi batch mencakup banyak SKPI (satu baris per SKPI): status transaksinya cukup dibaca sekali per putaran.
  const statuses = new Map<string, Promise<TxStatus>>()
  const statusOf = (txId: string) => {
    let p = statuses.get(txId)
    if (!p) {
      p = ctx.ledger.txStatus(txId)
      statuses.set(txId, p)
    }
    return p
  }
  const rows = await ledgerTx.pending(ctx.pool, new Date(now - inFlight).toISOString())
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (next < rows.length) {
        const tx = rows[next++]
        try {
          out[await settle(ctx, tx, now, statusOf)]++
        } catch (err) {
          // Satu baris gagal (peer putus-sambung, aset belum terbaca) tidak menghentikan baris lain.
          if (!(err instanceof LedgerError && err.kind === "UNAVAILABLE")) logger.error({ err, txId: tx.txId, npm: tx.npm }, "rekonsiliasi transaksi gagal")
          out.unknown++
        }
      }
    }),
  )

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
