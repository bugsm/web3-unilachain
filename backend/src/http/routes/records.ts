import { Router } from "express"
import type { Ctx } from "../../services/context.js"
import { activity, getRecord, listQueue, listRecords } from "../../services/records.js"
import { ledgerInfo, searchPublic, verify } from "../../services/verify.js"
import { perMinute } from "../rateLimit.js"
import { requireUser } from "../session.js"

const str = (v: unknown) => (typeof v === "string" ? v : undefined)

/** Rute baca staf (/records, /queue, /activity) dan publik (/verify, /ledger/info). */
export function readRoutes(ctx: Ctx) {
  const r = Router()
  const staff = requireUser(ctx.config, ctx.pool)

  r.get("/records", staff, async (req, res) => {
    res.json(await listRecords(ctx, req.account!, { status: str(req.query.status), q: str(req.query.q) }))
  })
  r.get("/records/:npm", staff, async (req, res) => {
    res.json(await getRecord(ctx, req.account!, String(req.params.npm)))
  })
  r.get("/queue", requireUser(ctx.config, ctx.pool, "dekan", "rektor"), async (req, res) => {
    res.json(await listQueue(ctx, req.account!))
  })
  r.get("/activity", staff, async (req, res) => {
    res.json(await activity(ctx, req.account!, Number(req.query.limit)))
  })

  const limited = perMinute(ctx.config.verifyRateLimitPerMin)
  r.get("/verify", limited, async (req, res) => {
    res.json(await searchPublic(ctx, req.query.q))
  })
  r.get("/verify/:npm", limited, async (req, res) => {
    res.json(await verify(ctx, String(req.params.npm)))
  })
  r.get("/ledger/info", async (_req, res) => {
    res.json(await ledgerInfo(ctx))
  })
  return r
}
