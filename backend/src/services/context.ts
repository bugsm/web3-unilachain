import type pg from "pg"
import type { Config } from "../config.js"
import type { DraftRow } from "../db/repos/drafts.js"
import type { UserRow } from "../db/repos/users.js"
import type { Ledger } from "../fabric/ledger.js"
import type { Draft } from "../types.js"
import { toUser } from "./auth.js"

/** Ketergantungan bersama layanan. */
export interface Ctx {
  config: Config
  pool: pg.Pool
  ledger: Ledger
  now: () => Date
}

export const nowIso = (ctx: Ctx) => ctx.now().toISOString()
export const actorOf = (ctx: Ctx, u: UserRow) => toUser(u, ctx.config.fabric.mspId).actorId

/** Bentuk `Draft` kontrak frontend: status internal MENUNGGU_KONFIRMASI tampil sebagai MENUNGGU_DEKAN. */
export function toDraft(d: DraftRow): Draft {
  return { ...d, status: d.status === "MENUNGGU_KONFIRMASI" ? "MENUNGGU_DEKAN" : d.status }
}
