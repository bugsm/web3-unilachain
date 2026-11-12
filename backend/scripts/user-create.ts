/*
 * Membuat akun staf. Sandi dibaca dari stdin (tidak masuk riwayat shell).
 *   npm run user:create -- --email dekan.fmipa@unila.ac.id --name "Dekan FMIPA" --role dekan --faculty FMIPA
 *   [--nip 18digit] [--nidn 10digit]
 * Identitas Fabric diturunkan dari peran & fakultas (dekan-fmipa, rektor); admin tidak memegang identitas.
 */
import { createInterface } from "node:readline/promises"
import { Writable } from "node:stream"
import { parseArgs } from "node:util"
import { loadConfig } from "../src/config.js"
import { createPool } from "../src/db/pool.js"
import type { FacultyCode } from "../src/domain/faculty.js"
import { createAccount, expectedIdentity } from "../src/services/accounts.js"
import type { Role } from "../src/types.js"

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
    faculty: { type: "string" },
    nip: { type: "string" },
    nidn: { type: "string" },
  },
})

const url = loadConfig(process.env).databaseUrl
if (!values.email || !values.name || !values.role) throw new Error("--email, --name, dan --role wajib diisi")

const role = values.role as Role
const faculty = (values.faculty?.toUpperCase() ?? null) as FacultyCode | null
// Ketikan sandi tidak ditampilkan di layar.
let muted = false
const out = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk, encoding)
    done()
  },
})
const rl = createInterface({ input: process.stdin, output: out, terminal: Boolean(process.stdin.isTTY) })
process.stdout.write("Kata sandi (min. 12 karakter): ")
muted = true
const password = await rl.question("")
muted = false
process.stdout.write("\n")
rl.close()

const pool = createPool(url)
try {
  const u = await createAccount(pool, {
    email: values.email,
    name: values.name,
    role,
    faculty,
    identity: expectedIdentity(role, faculty),
    nip: values.nip ?? null,
    nidn: values.nidn ?? null,
    password,
  })
  console.log(`Akun dibuat: ${u.email} (${u.role}${u.faculty ? ` ${u.faculty}` : ""}${u.fabricIdentity ? `, identitas ${u.fabricIdentity}` : ""})`)
} finally {
  await pool.end()
}
