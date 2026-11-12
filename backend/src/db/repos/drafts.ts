import type { FacultyCode } from "../../domain/faculty.js"
import type { DraftType, SkpiData } from "../../types.js"
import type { Queryable } from "../pool.js"

/** Status internal; MENUNGGU_KONFIRMASI keluar ke API sebagai MENUNGGU_DEKAN. */
export type DraftRowStatus = "MENUNGGU_DEKAN" | "MENUNGGU_KONFIRMASI" | "DITOLAK_DEKAN" | "DISETUJUI" | "DIGANTIKAN"

export interface DraftRow {
  id: string
  type: DraftType
  status: DraftRowStatus
  npm: string
  facultyCode: FacultyCode
  data: SkpiData | null
  reason: string | null
  rejectReason: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export const ISO = (c: string) => `to_char(${c} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

const COLS = `id::text, type, status, npm, faculty_code AS "facultyCode", data, reason, reject_reason AS "rejectReason",
  created_by AS "createdBy", ${ISO("created_at")} AS "createdAt", ${ISO("updated_at")} AS "updatedAt"`

const ACTIVE = `('MENUNGGU_DEKAN', 'MENUNGGU_KONFIRMASI', 'DITOLAK_DEKAN')`
const PENDING = `('MENUNGGU_DEKAN', 'MENUNGGU_KONFIRMASI')`

export interface NewDraftRow {
  type: DraftType
  npm: string
  facultyCode: FacultyCode
  data: SkpiData | null
  reason: string | null
  createdBy: string
  at: string
}

export interface DraftPatch {
  status?: DraftRowStatus
  data?: SkpiData | null
  rejectReason?: string | null
  at?: string
}

export const drafts = {
  async insert(q: Queryable, d: NewDraftRow): Promise<DraftRow> {
    const r = await q.query<DraftRow>(
      `INSERT INTO drafts (type, status, npm, faculty_code, data, reason, created_by, created_at, updated_at)
       VALUES ($1, 'MENUNGGU_DEKAN', $2, $3, $4, $5, $6, $7, $7) RETURNING ${COLS}`,
      [d.type, d.npm, d.facultyCode, d.data === null ? null : JSON.stringify(d.data), d.reason, d.createdBy, d.at],
    )
    return r.rows[0]
  },

  async get(q: Queryable, id: string): Promise<DraftRow | null> {
    if (!/^\d+$/.test(id)) return null
    const r = await q.query<DraftRow>(`SELECT ${COLS} FROM drafts WHERE id = $1`, [id])
    return r.rows[0] ?? null
  },

  /** Kunci baris draft (SELECT ... FOR UPDATE) di dalam transaksi. */
  async lock(q: Queryable, id: string): Promise<DraftRow | null> {
    if (!/^\d+$/.test(id)) return null
    const r = await q.query<DraftRow>(`SELECT ${COLS} FROM drafts WHERE id = $1 FOR UPDATE`, [id])
    return r.rows[0] ?? null
  },

  /** Draft yang masih menentukan status NPM (menunggu, menunggu konfirmasi, atau ditolak). */
  async activeFor(q: Queryable, npm: string): Promise<DraftRow | null> {
    const r = await q.query<DraftRow>(
      `SELECT ${COLS} FROM drafts WHERE npm = $1 AND status IN ${ACTIVE} ORDER BY id DESC LIMIT 1`,
      [npm],
    )
    return r.rows[0] ?? null
  },

  /** Draft aktif terbaru per NPM dalam lingkup fakultas (null = semua). */
  async activeInScope(q: Queryable, faculty: FacultyCode | null): Promise<DraftRow[]> {
    const r = await q.query<DraftRow>(
      `SELECT DISTINCT ON (npm) ${COLS} FROM drafts
       WHERE status IN ${ACTIVE} AND ($1::text IS NULL OR faculty_code = $1)
       ORDER BY npm, id DESC`,
      [faculty],
    )
    return r.rows
  },

  async update(q: Queryable, id: string, patch: DraftPatch): Promise<DraftRow> {
    const r = await q.query<DraftRow>(
      `UPDATE drafts SET
         status = COALESCE($2, status),
         data = CASE WHEN $3::boolean THEN $4::jsonb ELSE data END,
         reject_reason = CASE WHEN $5::boolean THEN $6 ELSE reject_reason END,
         updated_at = COALESCE($7::timestamptz, updated_at)
       WHERE id = $1 RETURNING ${COLS}`,
      [
        id,
        patch.status ?? null,
        "data" in patch,
        patch.data == null ? null : JSON.stringify(patch.data),
        "rejectReason" in patch,
        patch.rejectReason ?? null,
        patch.at ?? null,
      ],
    )
    return r.rows[0]
  },

  /** Draft DITOLAK_DEKAN lama untuk NPM ini dipensiunkan saat draft baru diajukan. */
  async retireRejected(q: Queryable, npm: string, at: string): Promise<void> {
    await q.query(`UPDATE drafts SET status = 'DIGANTIKAN', updated_at = $2 WHERE npm = $1 AND status = 'DITOLAK_DEKAN'`, [npm, at])
  },

  async listPendingForFaculty(q: Queryable, faculty: FacultyCode): Promise<DraftRow[]> {
    const r = await q.query<DraftRow>(
      `SELECT ${COLS} FROM drafts WHERE faculty_code = $1 AND status IN ${PENDING} ORDER BY updated_at, id`,
      [faculty],
    )
    return r.rows
  },

  /** Draft MENUNGGU_KONFIRMASI tanpa transaksi PENDING yang berumur lebih tua dari `before` (proses mati sebelum kirim). */
  async orphanedConfirming(q: Queryable, before: string): Promise<DraftRow[]> {
    const r = await q.query<DraftRow>(
      `SELECT ${COLS} FROM drafts d WHERE d.status = 'MENUNGGU_KONFIRMASI' AND d.updated_at < $1
         AND NOT EXISTS (SELECT 1 FROM ledger_tx t WHERE t.draft_id = d.id AND t.status = 'PENDING')`,
      [before],
    )
    return r.rows
  },

  /** Nomor SKPI dipakai draft tertunda NPM lain. */
  async skpiIdTaken(q: Queryable, skpiId: string, exceptNpm: string, exceptDraftId?: string): Promise<boolean> {
    const r = await q.query(
      `SELECT 1 FROM drafts WHERE status IN ${PENDING} AND data->>'skpiId' = $1 AND npm <> $2
         AND ($3::bigint IS NULL OR id <> $3) LIMIT 1`,
      [skpiId, exceptNpm, exceptDraftId ?? null],
    )
    return (r.rowCount ?? 0) > 0
  },
}
