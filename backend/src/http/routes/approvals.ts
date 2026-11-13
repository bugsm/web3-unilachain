import { Router } from "express"
import { approveDraft, approveDraftsBatch, rejectDraft, rektorApprove, rektorApproveBatch, rektorReject } from "../../services/approvals.js"
import type { Ctx } from "../../services/context.js"
import { requireUser } from "../session.js"

/** Dipasang di /api: /drafts/:id/approve|reject (dekan), /records/:npm/rektor/approve|reject (rektor). */
export function approvalRoutes(ctx: Ctx) {
  const r = Router()
  const dekan = requireUser(ctx.config, ctx.pool, "dekan")
  const rektor = requireUser(ctx.config, ctx.pool, "rektor")
  const reason = (body: unknown) => (body as { reason?: unknown } | undefined)?.reason

  r.post("/drafts/:id/approve", dekan, async (req, res) => {
    res.json(await approveDraft(ctx, req.account!, String(req.params.id)))
  })
  r.post("/drafts/:id/reject", dekan, async (req, res) => {
    res.json({ draft: await rejectDraft(ctx, req.account!, String(req.params.id), reason(req.body)) })
  })
  r.post("/records/:npm/rektor/approve", rektor, async (req, res) => {
    res.json(await rektorApprove(ctx, req.account!, String(req.params.npm)))
  })
  // Pengesahan massal: satu respons berisi hasil per item; seluruh kelompok dikirim serentak agar satu blok.
  r.post("/approvals/dekan/batch", dekan, async (req, res) => {
    res.json({ results: await approveDraftsBatch(ctx, req.account!, (req.body as { ids?: unknown } | undefined)?.ids) })
  })
  r.post("/approvals/rektor/batch", rektor, async (req, res) => {
    res.json({ results: await rektorApproveBatch(ctx, req.account!, (req.body as { npms?: unknown } | undefined)?.npms) })
  })
  r.post("/records/:npm/rektor/reject", rektor, async (req, res) => {
    res.json(await rektorReject(ctx, req.account!, String(req.params.npm), reason(req.body)))
  })
  return r
}
