import type { Queryable } from "../pool.js"

export type LedgerTxStatus = "PENDING" | "COMMITTED" | "FAILED"

export interface LedgerTxRow {
  txId: string
  draftId: string | null
  npm: string
  fn: string
  identity: string
  status: LedgerTxStatus
  error: string | null
}

export const ledgerTx = {
  async begin(q: Queryable, t: { txId: string; draftId: string | null; npm: string; fn: string; identity: string }): Promise<void> {
    await q.query(
      `INSERT INTO ledger_tx (tx_id, draft_id, npm, fn, identity, status) VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
      [t.txId, t.draftId, t.npm, t.fn, t.identity],
    )
  },

  async finish(q: Queryable, txId: string, status: Exclude<LedgerTxStatus, "PENDING">, error?: string): Promise<void> {
    await q.query(`UPDATE ledger_tx SET status = $2, error = $3, updated_at = now() WHERE tx_id = $1`, [txId, status, error ?? null])
  },

  async pending(q: Queryable): Promise<LedgerTxRow[]> {
    const r = await q.query<LedgerTxRow>(
      `SELECT tx_id AS "txId", draft_id::text AS "draftId", npm, fn, identity, status, error
       FROM ledger_tx WHERE status = 'PENDING' ORDER BY created_at`,
    )
    return r.rows
  },

  /** Ada transaksi rektor/dekan untuk NPM ini yang statusnya belum pasti. */
  async pendingForNpm(q: Queryable, npm: string): Promise<boolean> {
    const r = await q.query(`SELECT 1 FROM ledger_tx WHERE npm = $1 AND status = 'PENDING' LIMIT 1`, [npm])
    return (r.rowCount ?? 0) > 0
  },
}
