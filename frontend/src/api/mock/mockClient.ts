import { facultyOfNpm, issuerLabel, type FacultyCode } from "@/domain/faculty"
import { normalizeName, normalizeNpm } from "@/domain/skpi"
import type { ApiClient } from "../client"
import { ApiError } from "../errors"
import type { PublicSkpi, Role, SkpiRecord, User, VerifyResult } from "../types"
import { seedStore } from "./seed"
import * as ops from "./store"

export const DEMO_PASSWORD = "skpi-demo-2026"

interface Account extends User {
  email: string
}

const account = (email: string, role: Role, faculty: FacultyCode | null, name: string, actorId: string): Account => ({
  id: email,
  email,
  role,
  faculty,
  name,
  actorId,
})

export const DEMO_ACCOUNTS: Account[] = [
  account("admin.fmipa@unila.ac.id", "admin", "FMIPA", "Admin FMIPA", "admin.fmipa (off-chain)"),
  account("admin.ft@unila.ac.id", "admin", "FT", "Admin FT", "admin.ft (off-chain)"),
  account("dekan.fmipa@unila.ac.id", "dekan", "FMIPA", "Dekan FMIPA", "dekan-fmipa@UnilaMSP"),
  account("dekan.ft@unila.ac.id", "dekan", "FT", "Dekan FT", "dekan-ft@UnilaMSP"),
  account("rektor@unila.ac.id", "rektor", null, "Rektor Universitas Lampung", "rektor@UnilaMSP"),
]

/** Contoh tabel periode jabatan rektor (backend menyimpannya off-chain). */
const REKTOR_PERIODS = [{ name: "Rektor Contoh Periode 2023–2027", from: "2023-01-01", to: "2027-12-31" }]

const MAX_CANDIDATES = 10

function rektorName(ts: string): string | null {
  const day = ts.slice(0, 10)
  return REKTOR_PERIODS.find((p) => p.from <= day && day <= p.to)?.name ?? null
}

const clone = <T>(v: T): T => structuredClone(v)

export function createMockClient(opts: { latencyMs?: number; seed?: boolean; now?: () => Date } = {}): ApiClient {
  const latency = opts.latencyMs ?? 0
  const now = () => (opts.now ? opts.now() : new Date()).toISOString()
  const store = ops.createStore()
  if (opts.seed ?? true) seedStore(store, opts.now ? opts.now() : new Date())
  let session: Account | null = null

  async function wait() {
    if (latency > 0) await new Promise((r) => setTimeout(r, latency))
  }
  function requireUser(...roles: Role[]): Account {
    if (!session) throw new ApiError(401, "UNAUTHENTICATED", "Sesi berakhir, silakan masuk kembali.")
    if (roles.length && !roles.includes(session.role))
      throw new ApiError(403, "FORBIDDEN", "Anda tidak berwenang untuk tindakan ini.")
    return session
  }
  const inScope = (u: Account, npm: string) => u.role === "rektor" || facultyOfNpm(npm) === u.faculty
  function scopedRecords(u: Account): SkpiRecord[] {
    return ops
      .allNpms(store)
      .filter((npm) => inScope(u, npm))
      .map((npm) => ops.buildRecord(store, npm))
      .filter((r): r is SkpiRecord => r !== null)
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
  }
  function draftForDekan(u: Account, id: string) {
    const d = ops.findDraft(store, id)
    if (d.facultyCode !== u.faculty) throw new ApiError(403, "FORBIDDEN", "Draft bukan dari fakultas Anda.")
    return d
  }
  const toUser = ({ email: _e, ...u }: Account): User => clone(u)

  return {
    async login({ identifier, password, role }) {
      await wait()
      const acc = DEMO_ACCOUNTS.find((a) => a.email === identifier.trim().toLowerCase())
      if (!acc || password !== DEMO_PASSWORD)
        throw new ApiError(401, "INVALID_CREDENTIALS", "Email atau kata sandi salah.")
      if (acc.role !== role) throw new ApiError(403, "ROLE_MISMATCH", "Akun ini tidak memegang peran tersebut. Pilih peran yang sesuai.")
      session = acc
      return toUser(acc)
    },
    async me() {
      await wait()
      return session ? toUser(session) : null
    },
    async logout() {
      session = null
    },

    async listRecords(filter = {}) {
      await wait()
      const u = requireUser()
      const q = normalizeName(filter.q ?? "").toLowerCase()
      const match: Record<string, (s: SkpiRecord["status"]) => boolean> = {
        ALL: () => true,
        PENDING: (s) => s === "MENUNGGU_DEKAN" || s === "MENUNGGU_REKTOR",
        AKTIF: (s) => s === "AKTIF",
        DICABUT: (s) => s === "DICABUT",
        DITOLAK: (s) => s === "DITOLAK_DEKAN" || s === "DITOLAK_REKTOR",
      }
      return clone(
        scopedRecords(u)
          .filter((r) => match[filter.status ?? "ALL"](r.status))
          .filter((r) => !q || `${r.name} ${r.npm} ${r.skpiId}`.toLowerCase().includes(q)),
      )
    },
    async getRecord(npm) {
      await wait()
      const u = requireUser()
      const rec = inScope(u, npm) ? ops.buildRecord(store, npm) : null
      if (!rec) throw new ApiError(404, "NOT_FOUND", `SKPI ${npm} tidak ditemukan.`)
      return clone({ ...rec, history: store.history.get(npm) ?? [] })
    },
    async activity(limit) {
      await wait()
      const u = requireUser()
      const names = new Map(scopedRecords(u).map((r) => [r.npm, r.name]))
      return clone(
        [...names.keys()]
          .flatMap((npm) =>
            (store.history.get(npm) ?? []).map((h) => ({
              npm,
              name: names.get(npm)!,
              action: h.action,
              kind: h.kind,
              at: h.at,
              txId: h.txId,
            })),
          )
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, limit),
      )
    },
    async listQueue() {
      await wait()
      const u = requireUser("dekan", "rektor")
      if (u.role === "rektor")
        return clone(
          scopedRecords(u)
            .filter((r) => r.status === "MENUNGGU_REKTOR")
            .sort((a, b) => a.lastActivityAt.localeCompare(b.lastActivityAt))
            .map((record) => ({ kind: "rektor" as const, record })),
        )
      return clone(
        [...store.drafts.values()]
          .filter((d) => d.status === "MENUNGGU_DEKAN" && d.facultyCode === u.faculty)
          .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
          .map((draft) => ({ kind: "draft" as const, draft, record: ops.buildRecord(store, draft.npm) })),
      )
    },

    async createDraft(input) {
      await wait()
      const u = requireUser("admin")
      return clone(ops.submitDraft(store, { ...input, npm: normalizeNpm(input.npm) }, u.actorId, u.faculty!, now()))
    },
    async createDrafts(items) {
      await wait()
      const u = requireUser("admin")
      const res: Awaited<ReturnType<ApiClient["createDrafts"]>> = { created: [], errors: [] }
      items.forEach(({ npm, ...data }, index) => {
        try {
          res.created.push(ops.submitDraft(store, { type: "PENCATATAN", npm, data }, u.actorId, u.faculty!, now()))
        } catch (e) {
          if (!(e instanceof ApiError)) throw e
          res.errors.push({ index, npm, message: e.message })
        }
      })
      return clone(res)
    },
    async updateDraft(id, data) {
      await wait()
      const u = requireUser("admin")
      return clone(ops.resubmitDraft(store, id, data, u.actorId, u.faculty!, now()))
    },
    async approveDraft(id) {
      await wait()
      const u = requireUser("dekan")
      draftForDekan(u, id)
      return { txId: ops.approveDraft(store, id, u.actorId, issuerLabel(u.faculty!), now()) }
    },
    async rejectDraft(id, reason) {
      await wait()
      const u = requireUser("dekan")
      draftForDekan(u, id)
      return clone(ops.rejectDraft(store, id, reason, u.actorId, now()))
    },
    async rektorApprove(npm) {
      await wait()
      const u = requireUser("rektor")
      return { txId: ops.rektorApprove(store, npm, u.actorId, now()) }
    },
    async rektorReject(npm, reason) {
      await wait()
      const u = requireUser("rektor")
      return { txId: ops.rektorReject(store, npm, reason, u.actorId, now()) }
    },

    async searchPublic(q) {
      await wait()
      const needle = normalizeName(q).toLowerCase()
      if (needle.length < 3) throw new ApiError(400, "VALIDATION", "Masukkan minimal 3 huruf nama.")
      // Hanya SKPI yang pernah masuk ledger dan memberi hasil bermakna di VerifikasiSKPI.
      const hits = [...store.assets.values()].filter(
        (a) => a.status !== "DITOLAK_REKTOR" && normalizeName(a.name).toLowerCase().includes(needle),
      )
      return clone({
        candidates: hits.slice(0, MAX_CANDIDATES).map((a) => ({
          npm: a.npm,
          name: a.name,
          programStudy: a.programStudy,
          facultyCode: a.facultyCode,
        })),
        truncated: hits.length > MAX_CANDIDATES,
      })
    },
    async verify(npm) {
      await wait()
      const key = normalizeNpm(npm)
      if (!/^\d{10}$/.test(key)) throw new ApiError(400, "VALIDATION", "NPM harus 10 digit angka.")
      const a = store.assets.get(key)
      const none: VerifyResult = { status: "TIDAK_TERDAFTAR", data: null, rektorName: null }
      if (!a) return none
      if (a.status === "MENUNGGU_REKTOR") return { status: "BELUM_SAH", data: null, rektorName: null }
      if (a.status !== "AKTIF" && a.status !== "DICABUT") return none
      const data: PublicSkpi = {
        npm: a.npm,
        name: a.name,
        skpiId: a.skpiId,
        programStudy: a.programStudy,
        totalSKP: a.totalSKP,
        predicate: a.predicate,
        issuer: a.issuer,
        issuedTimestamp: a.issuedTimestamp,
        rektorTimestamp: a.rektorTimestamp,
        status: a.status,
      }
      return clone({
        status: a.status === "AKTIF" ? "TERDAFTAR" : "DICABUT",
        data,
        rektorName: rektorName(a.rektorTimestamp),
      })
    },
    async ledgerInfo() {
      return { channel: "skpi-channel", msp: "UnilaMSP" }
    },
  }
}
