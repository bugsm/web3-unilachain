import type { FacultyCode } from "../../domain/faculty.js"
import { FACULTIES } from "../../domain/faculty.js"
import type { ActivityItem, HistoryEntry } from "../../types.js"
import type { Queryable } from "../pool.js"
import { ISO } from "./drafts.js"

const npmDigit = (f: FacultyCode | null) => (f ? FACULTIES.find((x) => x.code === f)!.npmDigit : null)

export const events = {
  async add(q: Queryable, npm: string, e: HistoryEntry): Promise<void> {
    await q.query(
      `INSERT INTO events (npm, kind, action, at, actor, tx_id, note, changes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [npm, e.kind, e.action, e.at, e.actor, e.txId, e.note, JSON.stringify(e.changes)],
    )
  },

  /** Urut lama → baru. */
  async forNpm(q: Queryable, npm: string): Promise<HistoryEntry[]> {
    const r = await q.query<HistoryEntry>(
      `SELECT kind, action, ${ISO("at")} AS at, actor, tx_id AS "txId", note, changes
       FROM events WHERE npm = $1 ORDER BY at, id`,
      [npm],
    )
    return r.rows
  },

  /** Waktu peristiwa terakhir per NPM. */
  async lastActivity(q: Queryable, npms: string[]): Promise<Map<string, string>> {
    if (!npms.length) return new Map()
    const r = await q.query<{ npm: string; at: string }>(
      `SELECT npm, ${ISO("max(at)")} AS at FROM events WHERE npm = ANY($1) GROUP BY npm`,
      [npms],
    )
    return new Map(r.rows.map((x) => [x.npm, x.at]))
  },

  /** Peristiwa terbaru dalam lingkup fakultas (null = semua); nama dari proyeksi atau draft terakhir. */
  async recent(q: Queryable, faculty: FacultyCode | null, limit: number): Promise<ActivityItem[]> {
    const r = await q.query<ActivityItem>(
      `SELECT e.npm, COALESCE(a.name, d.data->>'name', e.npm) AS name, e.action, e.kind, ${ISO("e.at")} AS at, e.tx_id AS "txId"
       FROM events e
       LEFT JOIN ledger_assets a ON a.npm = e.npm
       LEFT JOIN LATERAL (SELECT data FROM drafts WHERE npm = e.npm AND data IS NOT NULL ORDER BY id DESC LIMIT 1) d ON true
       WHERE $1::text IS NULL OR substr(e.npm, 4, 1) = $1
       ORDER BY e.at DESC, e.id DESC LIMIT $2`,
      [npmDigit(faculty), limit],
    )
    return r.rows
  },
}
