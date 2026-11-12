/*
 * Titik masuk kontainer: validasi konfigurasi, migrasi, koneksi ledger, server HTTP, rekonsiliasi berkala.
 * Koneksi gateway dibuat malas per identitas, jadi server tetap hidup (dan menjawab 503) bila peer belum terjangkau.
 */
import { createApp } from "./app.js"
import { loadConfig } from "./config.js"
import { migrateUp } from "./db/migrate.js"
import { createPool } from "./db/pool.js"
import { createFabricLedger } from "./fabric/gateway.js"
import { logger } from "./log.js"
import { startReconciler } from "./services/reconcile.js"

const config = loadConfig(process.env)
await migrateUp(config.databaseUrl)
const pool = createPool(config.databaseUrl)
const ledger = await createFabricLedger(config.fabric)
const app = createApp({ config, pool, ledger })
const stopReconciler = startReconciler({ config, pool, ledger, now: () => new Date() })

const server = app.listen(config.port, () => logger.info({ port: config.port }, "backend SKPI berjalan"))

let closing = false
async function shutdown(signal: string) {
  if (closing) return
  closing = true
  logger.info({ signal }, "menghentikan backend")
  stopReconciler()
  server.close()
  await ledger.close().catch(() => undefined)
  await pool.end().catch(() => undefined)
  process.exit(0)
}
process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))
