import { Router } from "express"
import type { Ctx } from "../../services/context.js"
import { correctOfficial, listOfficials, officialChanges, replaceOfficial } from "../../services/officials.js"
import { requireUser } from "../session.js"

export function officialRoutes(ctx: Ctx) {
  const r = Router()
  const staff = requireUser(ctx.config, ctx.pool)
  const body = (b: unknown) => (b ?? {}) as Record<string, unknown>

  r.get("/", staff, async (_req, res) => {
    res.json(await listOfficials(ctx))
  })
  r.get("/changes", staff, async (req, res) => {
    res.json(await officialChanges(ctx, String(req.query.office ?? "")))
  })
  r.post("/:office/corrections", staff, async (req, res) => {
    const b = body(req.body)
    res.json(await correctOfficial(ctx, req.account!, String(req.params.office), b.periodId, b.name))
  })
  r.post("/:office/successions", staff, async (req, res) => {
    const b = body(req.body)
    res.json(await replaceOfficial(ctx, req.account!, String(req.params.office), b.name, b.from))
  })
  return r
}
