/*
 * Draft admin fakultas (off-chain). Aturan sama dengan frontend/src/api/mock/store.ts (submitDraft, resubmitDraft),
 * memakai proyeksi aset ledger untuk status dan kepemilikan nomor SKPI. Chaincode tetap memeriksa ulang saat disahkan.
 */
import type { Queryable } from "../db/pool.js"
import { withTx } from "../db/pool.js"
import { assets } from "../db/repos/assets.js"
import { drafts, type DraftRow } from "../db/repos/drafts.js"
import { events } from "../db/repos/events.js"
import type { UserRow } from "../db/repos/users.js"
import { facultyOfNpm, type FacultyCode } from "../domain/faculty.js"
import { normalizeName, normalizeNpm, normalizeReason, toForm, validateReason, validateSkpi } from "../domain/skpi.js"
import { badRequest, conflict, forbidden, notFound } from "../http/errors.js"
import type { BatchResult, DraftType, SkpiData, SkpiInput } from "../types.js"
import { ApiError } from "../http/errors.js"
import { actorOf, nowIso, toDraft, type Ctx } from "./context.js"

const CONTROL = /[\u0000-\u001f\u007f]/

const NOTE: Record<DraftType, string> = {
  PENCATATAN: "Draft pencatatan",
  PERUBAHAN: "Draft perubahan",
  PENCABUTAN: "Draft pencabutan",
}

export interface DraftRequest {
  type: DraftType
  npm: string
  data?: SkpiData
  reason?: string
}

export function assertNpmFaculty(npm: string, faculty: FacultyCode) {
  if (!/^\d{10}$/.test(npm)) throw badRequest("NPM harus 10 digit angka.")
  if (facultyOfNpm(npm) !== faculty) throw forbidden(`NPM ${npm} bukan mahasiswa ${faculty}.`)
}

export function assertData(npm: string, data: SkpiData | undefined, faculty: FacultyCode): SkpiData {
  if (!data || typeof data.name !== "string" || typeof data.skpiId !== "string" || typeof data.programStudy !== "string")
    throw badRequest("Data SKPI wajib diisi.")
  const total = Number(data.totalSKP)
  const errors = validateSkpi(toForm({ npm, ...data, totalSKP: Number.isFinite(total) ? total : NaN } as SkpiInput), faculty)
  const first = Object.values(errors)[0]
  if (first) throw badRequest(first)
  return { name: normalizeName(data.name), skpiId: data.skpiId.trim(), programStudy: data.programStudy, totalSKP: total }
}

/** Cermin validasiTeks chaincode untuk alasan: wajib, 10–500 karakter, tanpa karakter kontrol. */
export function assertReason(reason: unknown): string {
  if (typeof reason !== "string") throw badRequest("Alasan wajib diisi.")
  if (CONTROL.test(reason)) throw badRequest("Alasan tidak boleh berisi karakter kontrol.")
  const err = validateReason(reason)
  if (err) throw badRequest(err)
  return normalizeReason(reason)
}

async function assertActive(q: Queryable, npm: string) {
  const a = await assets.get(q, npm)
  if (!a) throw notFound(`SKPI ${npm} tidak ditemukan.`)
  if (a.status !== "AKTIF") throw conflict(`SKPI ${npm} berstatus ${a.status}, bukan AKTIF.`)
  return a
}

async function assertCanRegister(q: Queryable, npm: string) {
  const a = await assets.get(q, npm)
  if (a && a.status !== "DICABUT" && a.status !== "DITOLAK_REKTOR")
    throw conflict(`NPM ${npm} sudah memiliki SKPI berstatus ${a.status}.`)
}

export async function assertSkpiIdFree(q: Queryable, skpiId: string, npm: string, exceptDraftId?: string) {
  const owner = await assets.skpiIdOwner(q, skpiId)
  if ((owner && owner !== npm) || (await drafts.skpiIdTaken(q, skpiId, npm, exceptDraftId)))
    throw conflict("Nomor SKPI sudah dipakai SKPI lain.")
}

async function submit(ctx: Ctx, q: Queryable, user: UserRow, req: DraftRequest): Promise<DraftRow> {
  const faculty = user.faculty!
  const npm = normalizeNpm(String(req.npm ?? ""))
  assertNpmFaculty(npm, faculty)
  let data: SkpiData | null = null
  let reason: string | null = null
  if (req.type === "PENCABUTAN") {
    await assertActive(q, npm)
    reason = assertReason(req.reason)
  } else if (req.type === "PENCATATAN" || req.type === "PERUBAHAN") {
    data = assertData(npm, req.data, faculty)
    if (req.type === "PENCATATAN") await assertCanRegister(q, npm)
    else await assertActive(q, npm)
  } else throw badRequest("Jenis draft tidak dikenal.")

  const current = await drafts.activeFor(q, npm)
  if (current && current.status !== "DITOLAK_DEKAN") throw conflict(`NPM ${npm} sudah memiliki draft yang belum diputuskan.`)
  if (data) await assertSkpiIdFree(q, data.skpiId, npm)

  const at = nowIso(ctx)
  const actor = actorOf(ctx, user)
  // Draft lama yang ditolak dipensiunkan: tidak lagi menentukan status atau menyandera nomor SKPI.
  await drafts.retireRejected(q, npm, at)
  const draft = await drafts.insert(q, { type: req.type, npm, facultyCode: faculty, data, reason, createdBy: actor, at })
  await events.add(q, npm, {
    kind: "offchain",
    action: "DIAJUKAN",
    at,
    actor,
    txId: null,
    note: reason ? `${NOTE[req.type]}: ${reason}` : NOTE[req.type],
    changes: [],
  })
  return draft
}

/** Konflik unik (dua permintaan serentak untuk NPM yang sama) dilaporkan sebagai 409. */
function uniqueToConflict(e: unknown): never {
  if ((e as { code?: string })?.code === "23505") throw conflict("Draft untuk NPM ini sedang diajukan bersamaan, coba lagi.")
  throw e
}

export async function createDraft(ctx: Ctx, user: UserRow, req: DraftRequest) {
  return toDraft(await withTx(ctx.pool, (q) => submit(ctx, q, user, req)).catch(uniqueToConflict))
}

export async function createDrafts(ctx: Ctx, user: UserRow, items: SkpiInput[]): Promise<BatchResult> {
  const res: BatchResult = { created: [], errors: [] }
  for (const [index, item] of items.entries()) {
    const { npm, ...data } = item ?? ({} as SkpiInput)
    try {
      res.created.push(await createDraft(ctx, user, { type: "PENCATATAN", npm, data }))
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
      res.errors.push({ index, npm: normalizeNpm(String(npm ?? "")), message: e.message })
    }
  }
  return res
}

export async function resubmitDraft(ctx: Ctx, user: UserRow, id: string, data: SkpiData) {
  return toDraft(
    await withTx(ctx.pool, async (q) => {
      const d = await drafts.lock(q, id)
      if (!d) throw notFound("Draft tidak ditemukan.")
      assertNpmFaculty(d.npm, user.faculty!)
      if (d.status !== "DITOLAK_DEKAN" || d.type === "PENCABUTAN") throw conflict("Hanya draft yang ditolak Dekan yang dapat diperbaiki.")
      const clean = assertData(d.npm, data, user.faculty!)
      await assertSkpiIdFree(q, clean.skpiId, d.npm, d.id)
      const at = nowIso(ctx)
      const updated = await drafts.update(q, d.id, { status: "MENUNGGU_DEKAN", data: clean, rejectReason: null, at })
      await events.add(q, d.npm, {
        kind: "offchain",
        action: "DIAJUKAN",
        at,
        actor: actorOf(ctx, user),
        txId: null,
        note: "Diajukan ulang setelah perbaikan",
        changes: [],
      })
      return updated
    }).catch(uniqueToConflict),
  )
}
