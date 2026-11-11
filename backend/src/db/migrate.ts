import path from "node:path"
import { fileURLToPath } from "node:url"
import { runner } from "node-pg-migrate"

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations")

/** Jalankan semua migrasi yang belum diterapkan (dipakai saat start kontainer dan oleh test). */
export async function migrateUp(databaseUrl: string): Promise<void> {
  await runner({
    databaseUrl,
    dir: DIR,
    direction: "up",
    migrationsTable: "pgmigrations",
    log: () => undefined,
  })
}

// `npm run migrate`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL wajib diisi")
  await migrateUp(url)
  console.log("Migrasi selesai.")
}
