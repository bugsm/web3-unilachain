import { hash, verify } from "@node-rs/argon2"
import type { Queryable } from "../db/pool.js"
import { users, type UserRow } from "../db/repos/users.js"
import { ApiError } from "../http/errors.js"
import type { User } from "../types.js"

const INVALID = () => new ApiError(401, "INVALID_CREDENTIALS", "Email atau kata sandi salah.")

// Hash tiruan agar akun tidak dikenal tetap memakan waktu verifikasi yang sama (tanpa kebocoran lewat waktu respons).
let dummyHash: Promise<string> | null = null

/** Peran, fakultas, dan identitas Fabric berasal dari baris akun; klien tidak bisa memilihnya. */
export async function authenticate(q: Queryable, identifier: string, password: string): Promise<UserRow> {
  const row = await users.findByIdentifier(q, identifier)
  dummyHash ??= hash("akun-tidak-dikenal")
  const ok = await verify(row?.passwordHash ?? (await dummyHash), password).catch(() => false)
  if (!row || !row.active || !ok) throw INVALID()
  return row
}

/** Bentuk `User` kontrak frontend. Admin tidak memegang identitas Fabric. */
export function toUser(row: UserRow, mspId: string): User {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    faculty: row.faculty,
    actorId: row.fabricIdentity ? `${row.fabricIdentity}@${mspId}` : `${row.email.split("@")[0]} (off-chain)`,
  }
}
