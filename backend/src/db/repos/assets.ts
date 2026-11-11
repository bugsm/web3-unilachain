import type { FacultyCode } from "../../domain/faculty.js"
import type { LedgerStatus, Predicate } from "../../types.js"
import type { Queryable } from "../pool.js"

/** Aset persis seperti world state chaincode (tulisAset). */
export interface LedgerAsset {
  npm: string
  name: string
  skpiId: string
  programStudy: string
  totalSKP: number
  predicate: Predicate
  facultyCode: FacultyCode
  unitCode?: string
  issuer: string
  issuedTimestamp: string
  status: LedgerStatus
  dekanId: string
  rektorId: string
  rektorTimestamp: string
  updatedTimestamp: string
  revocationReason: string
}

/** Escape %, _ dan \ agar masukan pengguna tidak menjadi pola LIKE. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export const assets = {
  async upsert(q: Queryable, a: LedgerAsset): Promise<void> {
    await q.query(
      `INSERT INTO ledger_assets (npm, name, status, faculty_code, skpi_id, data, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (npm) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, faculty_code = EXCLUDED.faculty_code,
         skpi_id = EXCLUDED.skpi_id, data = EXCLUDED.data, synced_at = now()`,
      [a.npm, a.name, a.status, a.facultyCode, a.skpiId, JSON.stringify(a)],
    )
  },

  async get(q: Queryable, npm: string): Promise<LedgerAsset | null> {
    const r = await q.query<{ data: LedgerAsset }>(`SELECT data FROM ledger_assets WHERE npm = $1`, [npm])
    return r.rows[0]?.data ?? null
  },

  async list(q: Queryable, faculty: FacultyCode | null): Promise<LedgerAsset[]> {
    const r = await q.query<{ data: LedgerAsset }>(
      `SELECT data FROM ledger_assets WHERE $1::text IS NULL OR faculty_code = $1`,
      [faculty],
    )
    return r.rows.map((x) => x.data)
  },

  /** NPM pemegang nomor SKPI (aset selain DICABUT / DITOLAK_REKTOR), mengikuti indeks chaincode. */
  async skpiIdOwner(q: Queryable, skpiId: string): Promise<string | null> {
    const r = await q.query<{ npm: string }>(
      `SELECT npm FROM ledger_assets WHERE skpi_id = $1 AND status NOT IN ('DICABUT', 'DITOLAK_REKTOR') LIMIT 1`,
      [skpiId],
    )
    return r.rows[0]?.npm ?? null
  },

  /** Pencarian nama untuk verifikasi publik; aset DITOLAK_REKTOR tidak bermakna di VerifikasiSKPI. */
  async searchByName(q: Queryable, needle: string, limit: number): Promise<LedgerAsset[]> {
    const r = await q.query<{ data: LedgerAsset }>(
      `SELECT data FROM ledger_assets
       WHERE status <> 'DITOLAK_REKTOR' AND lower(name) LIKE '%' || lower($1) || '%' ESCAPE '\\'
       ORDER BY similarity(lower(name), lower($2)) DESC, name, npm LIMIT $3`,
      [likeEscape(needle), needle, limit],
    )
    return r.rows.map((x) => x.data)
  },
}
