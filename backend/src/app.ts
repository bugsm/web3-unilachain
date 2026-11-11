import cookieParser from "cookie-parser"
import express from "express"
import type pg from "pg"
import type { Config } from "./config.js"
import type { Ledger } from "./fabric/ledger.js"
import { errorHandler, notFoundHandler } from "./http/errors.js"
import { approvalRoutes } from "./http/routes/approvals.js"
import { authRoutes } from "./http/routes/auth.js"
import { draftRoutes } from "./http/routes/drafts.js"
import type { Ctx } from "./services/context.js"

export interface AppDeps {
  config: Config
  pool: pg.Pool
  ledger: Ledger
  /** Jam aplikasi (diganti di test). */
  now?: () => Date
}

export function createApp(deps: AppDeps) {
  const app = express()
  app.disable("x-powered-by")
  // Satu proxy di depan (nginx kontainer frontend): IP asli untuk rate limit.
  app.set("trust proxy", 1)
  app.use(express.json({ limit: "1mb" }))
  app.use(cookieParser())

  const ctx: Ctx = { config: deps.config, pool: deps.pool, ledger: deps.ledger, now: deps.now ?? (() => new Date()) }
  const api = express.Router()
  api.use("/auth", authRoutes(deps))
  api.use(approvalRoutes(ctx))
  api.use("/drafts", draftRoutes(ctx))
  app.use("/api", api)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
