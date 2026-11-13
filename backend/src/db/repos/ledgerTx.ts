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
  createdAt: string
}

/** Satu baris ledger_tx = satu SKPI dalam satu transaksi; `fn` adalah fungsi tingkat SKPI (SahkanDekan, SahkanRektor, ...). */
export interface LedgerTxItem {
  npm: string
  draftId: string | null
  fn: string
}

export const ledgerTx = {
  /** Satu transaksi batch: semua baris dicatat atau tidak sama sekali. */
  async beginMany(q: Queryable, t: { txId: string; identity: string; items: LedgerTxItem[] }): Promise<void> {
    if (t.items.length === 0) return
    await q.query(
      `INSERT INTO ledger_tx (tx_id, draft_id, npm, fn, identity, status)
       SELECT $1, i.draft_id, i.npm, i.fn, $2, 'PENDING'
       FROM unnest($3::bigint[], $4::text[], $5::text[]) AS i(draft_id, npm, fn)`,
      [t.txId, t.identity, t.items.map((i) => i.draftId), t.items.map((i) => i.npm), t.items.map((i) => i.fn)],
    )
  },

  async begin(q: Queryable, t: { txId: string; draftId: string | null; npm: string; fn: string; identity: string }): Promise<void> {
    await q.query(
      `INSERT INTO ledger_tx (tx_id, draft_id, npm, fn, identity, status) VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
      [t.txId, t.draftId, t.npm, t.fn, t.identity],
    )
  },

  /** Tandai COMMITTED hanya bila masih PENDING; false = sudah dicatat pihak lain (jalur normal atau rekonsiliasi). Per (transaksi, NPM). */
  async claimCommitted(q: Queryable, txId: string, npm: string): Promise<boolean> {
    const r = await q.query(
      `UPDATE ledger_tx SET status = 'COMMITTED', error = NULL, updated_at = now() WHERE tx_id = $1 AND npm = $2 AND status = 'PENDING'`,
      [txId, npm],
    )
    return (r.rowCount ?? 0) > 0
  },

  /** Selesaikan semua baris transaksi, atau hanya baris `npm` bila diberikan. */
  async finish(q: Queryable, txId: string, status: Exclude<LedgerTxStatus, "PENDING">, error?: string, npm?: string): Promise<void> {
    await q.query(
      `UPDATE ledger_tx SET status = $2, error = $3, updated_at = now() WHERE tx_id = $1 AND ($4::text IS NULL OR npm = $4)`,
      [txId, status, error ?? null, npm ?? null],
    )
  },

  /** Transaksi PENDING yang dibuat sebelum `before` (yang lebih muda mungkin masih diproses jalur normal). */
  async pending(q: Queryable, before: string): Promise<LedgerTxRow[]> {
    const r = await q.query<LedgerTxRow>(
      `SELECT tx_id AS "txId", draft_id::text AS "draftId", npm, fn, identity, status, error,
         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
       FROM ledger_tx WHERE status = 'PENDING' AND created_at < $1 ORDER BY created_at`,
      [before],
    )
    return r.rows
  },

  /** Ada transaksi rektor/dekan untuk NPM ini yang statusnya belum pasti. */
  async pendingForNpm(q: Queryable, npm: string): Promise<boolean> {
    const r = await q.query(`SELECT 1 FROM ledger_tx WHERE npm = $1 AND status = 'PENDING' LIMIT 1`, [npm])
    return (r.rowCount ?? 0) > 0
  },
}
