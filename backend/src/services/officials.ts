/* Periode jabatan pejabat penanda tangan (spec pejabat 2026-11-11). Aturan sama dengan frontend/src/api/mock/officials.ts. */
import { withTx } from "../db/pool.js"
import { officials } from "../db/repos/officials.js"
import type { UserRow } from "../db/repos/users.js"
import { canEditOffice, dayBefore, normalizeOfficialName, validateOfficialName, validateSuccession, wibDate } from "../domain/officials.js"
import { badRequest, conflict, forbidden, notFound } from "../http/errors.js"
import type { Office, Official } from "../types.js"
import { toUser } from "./auth.js"
import { actorOf, nowIso, type Ctx } from "./context.js"

const OFFICES = new Set<string>(["REKTOR", "FEB", "FH", "FKIP", "FP", "FT", "FISIP", "FMIPA", "FK"])

function assertOffice(ctx: Ctx, user: UserRow, office: string): Office {
  if (!OFFICES.has(office)) throw notFound(`Jabatan ${office} tidak dikenal.`)
  if (!canEditOffice(toUser(user, ctx.config.fabric.mspId), office as Office))
    throw forbidden("Anda hanya dapat mengubah Rektor dan Dekan fakultas Anda.")
  return office as Office
}

function assertName(name: unknown): string {
  const raw = typeof name === "string" ? name : ""
  const err = validateOfficialName(raw)
  if (err) throw badRequest(err)
  return normalizeOfficialName(raw)
}

export const listOfficials = (ctx: Ctx) => officials.list(ctx.pool)

export function officialChanges(ctx: Ctx, office: string) {
  if (!OFFICES.has(office)) throw notFound(`Jabatan ${office} tidak dikenal.`)
  return officials.changes(ctx.pool, office as Office)
}

export async function correctOfficial(ctx: Ctx, user: UserRow, rawOffice: string, periodId: unknown, name: unknown): Promise<Official> {
  const office = assertOffice(ctx, user, rawOffice)
  const clean = assertName(name)
  return withTx(ctx.pool, async (q) => {
    const period = (await officials.periods(q, office)).find((p) => p.id === String(periodId))
    if (!period) throw notFound("Periode jabatan tidak ditemukan.")
    // Simpan tanpa perubahan tidak boleh menggeser "terakhir diubah oleh".
    if (clean === period.name) throw badRequest("Nama tidak berubah.")
    await officials.rename(q, period.id, clean)
    await officials.logChange(q, { office, kind: "KOREKSI", before: period.name, after: clean, by: actorOf(ctx, user), at: nowIso(ctx) })
    return (await officials.get(q, office))!
  })
}

export async function replaceOfficial(ctx: Ctx, user: UserRow, rawOffice: string, name: unknown, from: unknown): Promise<Official> {
  const office = assertOffice(ctx, user, rawOffice)
  const clean = assertName(name)
  return withTx(ctx.pool, async (q) => {
    const periods = await officials.periods(q, office)
    const start = typeof from === "string" ? from : ""
    const err = validateSuccession(periods, start, wibDate(nowIso(ctx)))
    if (err) throw conflict(err)
    const current = periods[periods.length - 1]
    await officials.close(q, current.id, dayBefore(start))
    await officials.open(q, office, clean, start)
    await officials.logChange(q, { office, kind: "PERGANTIAN", before: current.name, after: clean, by: actorOf(ctx, user), at: nowIso(ctx) })
    return (await officials.get(q, office))!
  })
}
