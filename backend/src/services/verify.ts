/*
 * Verifikasi publik (tanpa login). Status selalu dibaca dari ledger (VerifikasiSKPI, identitas app-reader), tanpa cache;
 * pencarian nama memakai proyeksi lalu pemeriksa memilih NPM. Respons hanya field publik.
 */
import { assets } from "../db/repos/assets.js"
import { officials } from "../db/repos/officials.js"
import { facultyOfNpm } from "../domain/faculty.js"
import { nameAt } from "../domain/officials.js"
import { normalizeName, normalizeNpm } from "../domain/skpi.js"
import { toApiError } from "../fabric/errors.js"
import { badRequest } from "../http/errors.js"
import type { LedgerInfo, PublicSkpi, VerifyCandidate, VerifyResult, VerifyStatus } from "../types.js"
import { nowIso, type Ctx } from "./context.js"

const MAX_CANDIDATES = 10

export async function searchPublic(ctx: Ctx, raw: unknown): Promise<{ candidates: VerifyCandidate[]; truncated: boolean }> {
  const needle = normalizeName(typeof raw === "string" ? raw : "")
  if (needle.length < 3) throw badRequest("Masukkan minimal 3 huruf nama.")
  if (needle.length > 100) throw badRequest("Nama terlalu panjang.")
  const hits = await assets.searchByName(ctx.pool, needle, MAX_CANDIDATES + 1)
  return {
    candidates: hits.slice(0, MAX_CANDIDATES).map((a) => ({ npm: a.npm, name: a.name, programStudy: a.programStudy, facultyCode: a.facultyCode })),
    truncated: hits.length > MAX_CANDIDATES,
  }
}

export async function verify(ctx: Ctx, raw: string): Promise<VerifyResult> {
  const npm = normalizeNpm(raw)
  if (!/^\d{10}$/.test(npm)) throw badRequest("NPM harus 10 digit angka.")
  let parsed: { status: VerifyStatus; data: PublicSkpi | null }
  try {
    parsed = JSON.parse(await ctx.ledger.evaluate(ctx.config.fabric.readerIdentity, "VerifikasiSKPI", [npm]))
  } catch (e) {
    throw toApiError(e)
  }
  const data = parsed.data
  if (!data) return { status: parsed.status, data: null, rektorName: null, dekanName: null }
  const faculty = facultyOfNpm(npm)
  const [rektor, dekan] = await Promise.all([
    officials.periods(ctx.pool, "REKTOR"),
    faculty ? officials.periods(ctx.pool, faculty) : Promise.resolve([]),
  ])
  return { status: parsed.status, data, rektorName: nameAt(rektor, data.rektorTimestamp), dekanName: nameAt(dekan, data.issuedTimestamp) }
}

export async function ledgerInfo(ctx: Ctx): Promise<LedgerInfo> {
  try {
    const height = await ctx.ledger.chainHeight()
    return { channel: ctx.config.fabric.channel, msp: ctx.config.fabric.mspId, height, checkedAt: nowIso(ctx) }
  } catch (e) {
    throw toApiError(e)
  }
}
