import type { Office, Official, OfficialChange, OfficialPeriod } from "../../types.js"
import type { Queryable } from "../pool.js"
import { ISO } from "./drafts.js"

const ORDER: Office[] = ["REKTOR", "FEB", "FH", "FKIP", "FP", "FT", "FISIP", "FMIPA", "FK"]

async function periods(q: Queryable, office: Office): Promise<OfficialPeriod[]> {
  const r = await q.query<OfficialPeriod>(
    `SELECT id::text, name, to_char(from_date, 'YYYY-MM-DD') AS "from", to_char(to_date, 'YYYY-MM-DD') AS "to"
     FROM official_periods WHERE office = $1 ORDER BY from_date, id`,
    [office],
  )
  return r.rows
}

/** Urut terbaru → lama. */
async function changes(q: Queryable, office: Office): Promise<OfficialChange[]> {
  const r = await q.query<OfficialChange>(
    `SELECT id::text, office, kind, before, after, by_actor AS "by", ${ISO("at")} AS at
     FROM official_changes WHERE office = $1 ORDER BY at DESC, id DESC`,
    [office],
  )
  return r.rows
}

async function get(q: Queryable, office: Office): Promise<Official | null> {
  const p = await periods(q, office)
  if (!p.length) return null
  const [last] = await changes(q, office)
  return { office, periods: p, lastChange: last ?? null }
}

export const officials = {
  periods,
  changes,
  get,

  async list(q: Queryable): Promise<Official[]> {
    const out: Official[] = []
    for (const office of ORDER) {
      const o = await get(q, office)
      if (o) out.push(o)
    }
    return out
  },

  async rename(q: Queryable, periodId: string, name: string): Promise<void> {
    await q.query(`UPDATE official_periods SET name = $2 WHERE id = $1`, [periodId, name])
  },

  async close(q: Queryable, periodId: string, to: string): Promise<void> {
    await q.query(`UPDATE official_periods SET to_date = $2 WHERE id = $1`, [periodId, to])
  },

  async open(q: Queryable, office: Office, name: string, from: string): Promise<void> {
    await q.query(`INSERT INTO official_periods (office, name, from_date) VALUES ($1, $2, $3)`, [office, name, from])
  },

  async logChange(q: Queryable, c: Omit<OfficialChange, "id">): Promise<void> {
    await q.query(
      `INSERT INTO official_changes (office, kind, before, after, by_actor, at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [c.office, c.kind, c.before, c.after, c.by, c.at],
    )
  },
}
