import { hash } from "@node-rs/argon2"
import request from "supertest"
import { createApp, type AppDeps } from "../../src/app.js"
import { loadConfig } from "../../src/config.js"
import type { NewUser } from "../../src/db/repos/users.js"
import { users } from "../../src/db/repos/users.js"
import type { Ledger } from "../../src/fabric/ledger.js"
import { TEST_DATABASE_URL, resetDb } from "./db.js"

export const DEMO_PASSWORD = "skpi-demo-2026"

export const testConfig = loadConfig({
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: "rahasia-test-yang-cukup-panjang-32+",
  COOKIE_SECURE: "false",
  FABRIC_PEER_ENDPOINT: "peer1.unila.local:7051",
  FABRIC_PEER_HOST_ALIAS: "peer1.unila.local",
  FABRIC_TLS_CA_PATH: "/tidak-dipakai",
  FABRIC_WALLET_DIR: "/tidak-dipakai",
  // Konfirmasi terlambat diperiksa sekali saja di tes (tanpa menunggu).
  FABRIC_CONFIRM_WAIT_MS: "0",
})

let passwordHash: string | null = null

const ACCOUNTS: Array<Omit<NewUser, "passwordHash">> = [
  { email: "admin.fmipa@unila.ac.id", nip: "198001012005011001", nidn: null, name: "Admin FMIPA", role: "admin", faculty: "FMIPA", fabricIdentity: null },
  { email: "admin.ft@unila.ac.id", nip: null, nidn: null, name: "Admin FT", role: "admin", faculty: "FT", fabricIdentity: null },
  { email: "dekan.fmipa@unila.ac.id", nip: null, nidn: "0012345678", name: "Dekan FMIPA", role: "dekan", faculty: "FMIPA", fabricIdentity: "dekan-fmipa" },
  { email: "dekan.ft@unila.ac.id", nip: null, nidn: null, name: "Dekan FT", role: "dekan", faculty: "FT", fabricIdentity: "dekan-ft" },
  { email: "rektor@unila.ac.id", nip: null, nidn: null, name: "Rektor Universitas Lampung", role: "rektor", faculty: null, fabricIdentity: "rektor" },
]

/** Ledger yang menolak semua panggilan; dipakai test yang tidak menyentuh ledger. */
export const offlineLedger: Ledger = {
  submit: () => Promise.reject(new Error("ledger tidak dipakai di test ini")),
  evaluate: () => Promise.reject(new Error("ledger tidak dipakai di test ini")),
  chainHeight: () => Promise.reject(new Error("ledger tidak dipakai di test ini")),
  txStatus: () => Promise.reject(new Error("ledger tidak dipakai di test ini")),
  close: () => Promise.resolve(),
}

/** Aplikasi di atas DB test yang dikosongkan + akun demo; `agentAs` mengembalikan agen yang sudah login. */
export async function buildTestApp(opts: { ledger?: Ledger; now?: () => Date; config?: AppDeps["config"] } = {}) {
  const pool = await resetDb()
  passwordHash ??= await hash(DEMO_PASSWORD)
  for (const a of ACCOUNTS) await users.create(pool, { ...a, passwordHash })
  const app = createApp({ config: opts.config ?? testConfig, pool, ledger: opts.ledger ?? offlineLedger, now: opts.now })
  async function agentAs(email: string) {
    const agent = request.agent(app)
    const res = await agent.post("/api/auth/login").send({ identifier: email, password: DEMO_PASSWORD })
    if (res.status !== 200) throw new Error(`login ${email} gagal: ${res.status} ${JSON.stringify(res.body)}`)
    return agent
  }
  return { app, pool, agentAs }
}
