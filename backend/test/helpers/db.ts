import pg from "pg"
import { migrateUp } from "../../src/db/migrate.js"

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://skpi_test:skpi_test@127.0.0.1:55432/skpi_test"

let pool: pg.Pool | null = null
let migrated = false

/** Pool ke Postgres test (docker-compose.test.yml); migrasi dijalankan sekali per proses. */
export async function testPool(): Promise<pg.Pool> {
  pool ??= new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 5 })
  if (!migrated) {
    await migrateUp(TEST_DATABASE_URL)
    migrated = true
  }
  return pool
}

/** Kosongkan semua tabel aplikasi dan isi ulang data awal pejabat. */
export async function resetDb(): Promise<pg.Pool> {
  const p = await testPool()
  await p.query(
    "TRUNCATE users, drafts, events, ledger_assets, ledger_tx, official_changes, official_periods RESTART IDENTITY CASCADE",
  )
  await p.query("SELECT seed_officials()")
  return p
}

after(async () => {
  await pool?.end()
  pool = null
})
