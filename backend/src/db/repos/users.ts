import type { FacultyCode } from "../../domain/faculty.js"
import type { Role } from "../../types.js"
import type { Queryable } from "../pool.js"

export interface UserRow {
  id: string
  email: string
  nip: string | null
  nidn: string | null
  passwordHash: string
  name: string
  role: Role
  faculty: FacultyCode | null
  fabricIdentity: string | null
  active: boolean
}

export type NewUser = Omit<UserRow, "id" | "active">

const COLS = `id::text, email, nip, nidn, password_hash AS "passwordHash", name, role, faculty,
  fabric_identity AS "fabricIdentity", active`

export const users = {
  /** Email (tanpa beda huruf besar/spasi), NIP, atau NIDN. */
  async findByIdentifier(q: Queryable, identifier: string): Promise<UserRow | null> {
    const v = identifier.trim()
    const r = await q.query<UserRow>(
      `SELECT ${COLS} FROM users WHERE email = lower($1) OR nip = $2 OR nidn = $2 LIMIT 1`,
      [v, v.replace(/\s+/g, "")],
    )
    return r.rows[0] ?? null
  },

  async findById(q: Queryable, id: string): Promise<UserRow | null> {
    if (!/^\d+$/.test(id)) return null
    const r = await q.query<UserRow>(`SELECT ${COLS} FROM users WHERE id = $1`, [id])
    return r.rows[0] ?? null
  },

  async create(q: Queryable, u: NewUser): Promise<UserRow> {
    const r = await q.query<UserRow>(
      `INSERT INTO users (email, nip, nidn, password_hash, name, role, faculty, fabric_identity)
       VALUES (lower($1), $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLS}`,
      [u.email.trim(), u.nip, u.nidn, u.passwordHash, u.name, u.role, u.faculty, u.fabricIdentity],
    )
    return r.rows[0]
  },
}
