import { hash } from "@node-rs/argon2"
import type { Queryable } from "../db/pool.js"
import { users, type UserRow } from "../db/repos/users.js"
import { FACULTIES, type FacultyCode } from "../domain/faculty.js"
import type { Role } from "../types.js"

export interface NewAccount {
  email: string
  name: string
  role: Role
  faculty: FacultyCode | null
  /** Label identitas di wallet: dekan-<fakultas> untuk dekan, "rektor" untuk rektor, null untuk admin. */
  identity: string | null
  nip: string | null
  nidn: string | null
  password: string
}

/** Identitas Fabric yang sah untuk peran & fakultas (network/pengesah.conf). */
export function expectedIdentity(role: Role, faculty: FacultyCode | null): string | null {
  if (role === "rektor") return "rektor"
  if (role === "dekan") return `dekan-${faculty!.toLowerCase()}`
  return null
}

function validate(a: NewAccount) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())) throw new Error("Format email tidak valid.")
  if (!a.name.trim()) throw new Error("Nama wajib diisi.")
  if (a.nip !== null && !/^\d{18}$/.test(a.nip)) throw new Error("NIP harus 18 digit.")
  if (a.nidn !== null && !/^\d{10}$/.test(a.nidn)) throw new Error("NIDN harus 10 digit.")
  if (a.password.length < 12) throw new Error("Kata sandi minimal 12 karakter.")
  if (a.role === "rektor") {
    if (a.faculty !== null) throw new Error("Rektor tidak terikat fakultas.")
  } else if (!a.faculty || !FACULTIES.some((f) => f.code === a.faculty)) {
    throw new Error("Admin dan dekan wajib memiliki fakultas yang valid.")
  }
  const want = expectedIdentity(a.role, a.faculty)
  if (a.role === "admin" && a.identity !== null) throw new Error("Admin fakultas tidak memegang identitas Fabric.")
  if (a.role !== "admin" && a.identity !== want) throw new Error(`Identitas Fabric untuk peran ini harus ${want}.`)
}

export async function createAccount(q: Queryable, a: NewAccount): Promise<UserRow> {
  validate(a)
  return users.create(q, {
    email: a.email,
    name: a.name.trim(),
    role: a.role,
    faculty: a.faculty,
    fabricIdentity: a.identity,
    nip: a.nip,
    nidn: a.nidn,
    passwordHash: await hash(a.password),
  })
}
