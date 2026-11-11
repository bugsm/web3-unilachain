import { Router } from "express"
import { createDraft, createDrafts, resubmitDraft } from "../../services/drafts.js"
import type { Ctx } from "../../services/context.js"
import type { SkpiData } from "../../types.js"
import { badRequest } from "../errors.js"
import { requireUser } from "../session.js"

/** Body datar (spec frontend §6): {type, npm, name?, skpiId?, programStudy?, totalSKP?, reason?}. */
function flatData(body: Record<string, unknown>): SkpiData | undefined {
  if (body.name === undefined && body.skpiId === undefined) return undefined
  return {
    name: body.name as string,
    skpiId: body.skpiId as string,
    programStudy: body.programStudy as string,
    totalSKP: body.totalSKP as number,
  }
}

export function draftRoutes(ctx: Ctx) {
  const r = Router()
  const admin = requireUser(ctx.config, ctx.pool, "admin")

  r.post("/", admin, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const draft = await createDraft(ctx, req.account!, {
      type: b.type as never,
      npm: String(b.npm ?? ""),
      data: flatData(b),
      reason: b.reason as string | undefined,
    })
    res.status(201).json({ draft })
  })

  r.post("/batch", admin, async (req, res) => {
    const items = (req.body as { items?: unknown })?.items
    if (!Array.isArray(items) || items.length === 0) throw badRequest("Daftar items wajib diisi.")
    if (items.length > 500) throw badRequest("Maksimal 500 baris per batch.")
    res.json(await createDrafts(ctx, req.account!, items))
  })

  r.put("/:id", admin, async (req, res) => {
    const data = flatData((req.body ?? {}) as Record<string, unknown>)
    if (!data) throw badRequest("Data SKPI wajib diisi.")
    res.json({ draft: await resubmitDraft(ctx, req.account!, String(req.params.id), data) })
  })

  return r
}
