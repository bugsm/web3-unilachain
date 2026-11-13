/*
 * Ledger tiruan untuk test: meniru 8 fungsi chaincode skpi (onchain/chaincode/skpi/lib/skpiContract.js),
 * termasuk pesan galat, indeks nomor SKPI, kode unit, dan fakultas NPM. Bukan pengganti uji jaringan nyata.
 */
import { randomBytes } from "node:crypto"
import { FACULTIES, facultyOfNpm, issuerLabel } from "../../src/domain/faculty.js"
import { LedgerError, type Ledger, type LedgerErrorKind } from "../../src/fabric/ledger.js"

type Asset = Record<string, unknown> & { npm: string; status: string; skpiId: string }

const BASE_HEIGHT = 1200
const PUBLIC = ["npm", "name", "skpiId", "programStudy", "totalSKP", "predicate", "issuer", "issuedTimestamp", "rektorTimestamp", "status"]

function predicate(t: number) {
  return t > 225 ? "Unggul" : t > 150 ? "Sangat Baik" : t > 75 ? "Baik" : "Cukup"
}

interface Identity {
  id: string
  role: "dekan" | "rektor" | "reader"
  facultyCode?: string
  unitCode?: string
  issuer?: string
}

function identityOf(label: string): Identity {
  const id = `x509::/OU=client/CN=${label}::/C=ID/CN=ca.unila.local`
  if (label === "rektor") return { id, role: "rektor" }
  if (label === "app-reader") return { id, role: "reader" }
  const fac = FACULTIES.find((f) => `dekan-${f.code.toLowerCase()}` === label)
  if (!fac) throw new LedgerError("REJECTED", `identitas ${label} tidak ada di wallet`)
  return { id, role: "dekan", facultyCode: fac.code, unitCode: fac.unitCode, issuer: issuerLabel(fac.code) }
}

const reject = (m: string) => new LedgerError("REJECTED", m)

export class FakeLedger implements Ledger {
  readonly state = new Map<string, Asset>()
  readonly index = new Map<string, string>()
  readonly history = new Map<string, Array<{ txId: string; timestamp: string; isDelete: boolean; penandaTangan: string; data: Asset }>>()
  readonly txs = new Map<string, "COMMITTED" | "INVALID">()
  private height = BASE_HEIGHT
  private online = true
  private nextFailure: { kind: LedgerErrorKind; applied: boolean } | null = null
  submitCalls = 0
  /** Jumlah transaksi di tiap blok yang dibuat (setiap submit = satu blok berisi satu transaksi). */
  readonly blockSizes: number[] = []
  /** Jumlah aset (SKPI) yang ditulis di tiap blok: 1 untuk transaksi tunggal, N untuk SahkanDekanBatch/SahkanRektorBatch. */
  readonly blockAssets: number[] = []

  constructor(private readonly now: () => Date = () => new Date()) {}

  setOnline(v: boolean) {
    this.online = v
  }

  /** Kegagalan untuk submit berikutnya. COMMIT_UNKNOWN + applied: transaksi sebenarnya tercatat. */
  failNextSubmitWith(kind: LedgerErrorKind, opts: { applied?: boolean; message?: string } = {}) {
    this.nextFailure = { kind, applied: opts.applied ?? false }
    if (opts.message) this.failMessage = opts.message
  }
  private failMessage = "simulasi"

  private assertOnline() {
    if (!this.online) throw new LedgerError("UNAVAILABLE", "14 UNAVAILABLE: No connection established")
  }

  async submit(identity: string, fn: string, args: string[], onSubmitting?: (txId: string) => Promise<void>) {
    this.assertOnline()
    this.submitCalls++
    const txId = randomBytes(32).toString("hex")
    const failure = this.nextFailure
    this.nextFailure = null
    if (failure?.kind === "UNAVAILABLE") throw new LedgerError("UNAVAILABLE", "14 UNAVAILABLE: No connection established")
    if (failure?.kind === "REJECTED") throw reject(this.failMessage)
    // Endorse (simulasi): penolakan chaincode terjadi sebelum transaksi dikirim ke orderer.
    this.dryRun(identity, fn, args)
    await onSubmitting?.(txId)
    if (failure?.kind === "COMMIT_UNKNOWN") {
      if (failure.applied) {
        this.commitBlock(identity, fn, args, txId)
        this.txs.set(txId, "COMMITTED")
      } else this.txs.set(txId, "INVALID")
      throw new LedgerError("COMMIT_UNKNOWN", "4 DEADLINE_EXCEEDED: commit status", txId)
    }
    const result = this.commitBlock(identity, fn, args, txId)
    this.txs.set(txId, "COMMITTED")
    return { txId, result }
  }

  /** Terapkan transaksi dan catat bloknya: satu transaksi = satu blok, berisi satu aset atau banyak (fungsi batch). */
  private commitBlock(identity: string, fn: string, args: string[], txId: string): string {
    const result = this.apply(identity, fn, args, txId)
    this.blockSizes.push(1)
    this.blockAssets.push(fn.endsWith("Batch") ? (JSON.parse(result) as unknown[]).length : 1)
    return result
  }

  async evaluate(identity: string, fn: string, args: string[]) {
    this.assertOnline()
    const who = identityOf(identity)
    const [npm] = args
    if (!/^\d{10}$/.test(npm ?? "")) throw reject("NPM harus 10 digit angka")
    if (fn === "VerifikasiSKPI") {
      this.role(who, ["reader", "dekan", "rektor"])
      const a = this.state.get(npm)
      const pub = a ? Object.fromEntries(PUBLIC.map((k) => [k, a[k]])) : null
      if (a?.status === "AKTIF") return JSON.stringify({ status: "TERDAFTAR", data: pub })
      if (a?.status === "DICABUT") return JSON.stringify({ status: "DICABUT", data: pub })
      if (a?.status === "MENUNGGU_REKTOR") return JSON.stringify({ status: "BELUM_SAH", data: null })
      return JSON.stringify({ status: "TIDAK_TERDAFTAR", data: null })
    }
    if (fn === "BacaSKPI" || fn === "RiwayatSKPI") {
      this.role(who, ["dekan", "rektor"])
      if (who.role === "dekan") this.facultyOf(npm, who)
      if (fn === "RiwayatSKPI") return JSON.stringify(this.history.get(npm) ?? [])
      return JSON.stringify(this.must(npm))
    }
    throw reject(`Fungsi ${fn} tidak dikenal`)
  }

  async chainHeight() {
    this.assertOnline()
    return this.height
  }

  async txStatus(txId: string) {
    this.assertOnline()
    return this.txs.get(txId) ?? "UNKNOWN"
  }

  async close() {}

  // --- aturan chaincode ---

  private role(who: Identity, roles: Identity["role"][]) {
    if (!roles.includes(who.role)) throw reject(`Akses ditolak: peran ${who.role} dari UnilaMSP tidak diizinkan`)
  }

  private facultyOf(npm: string, who: Identity) {
    if (facultyOfNpm(npm) !== who.facultyCode) throw reject(`Akses ditolak: NPM ${npm} bukan mahasiswa fakultas ${who.facultyCode}`)
  }

  private must(npm: string): Asset {
    const a = this.state.get(npm)
    if (!a) throw reject(`SKPI dengan NPM ${npm} tidak ditemukan`)
    return a
  }

  private status(a: Asset, s: string) {
    if (a.status !== s) throw reject(`SKPI ${a.npm} berstatus ${a.status}, seharusnya ${s}`)
  }

  private data(who: Identity, [, name, skpiId, programStudy, totalSKP]: string[]) {
    const m = /^\d{3,}\/(UN26\.\d{1,2})\/SKPI\/\d{4}$/.exec(skpiId ?? "")
    if (!m || skpiId.length > 64) throw reject("Format nomor SKPI tidak valid, contoh: 001/UN26.17/SKPI/2026")
    if (m[1] !== who.unitCode) throw reject(`Kode unit nomor SKPI (${m[1]}) tidak sama dengan kode unit dekan (${who.unitCode})`)
    const total = /^\d+$/.test(totalSKP ?? "") ? Number(totalSKP) : NaN
    if (!Number.isSafeInteger(total)) throw reject("totalSKP harus bilangan bulat")
    if (total < 25) throw reject(`totalSKP ${total} tidak memenuhi syarat SKPI (minimal 25)`)
    const text = (v: string, label: string) => {
      const t = (v ?? "").trim()
      if (!t) throw reject(`${label} wajib diisi`)
      if (t.length > 100 || /[\u0000-\u001f\u007f]/.test(t)) throw reject(`${label} tidak valid (maksimal 100 karakter, tanpa karakter kontrol)`)
      return t
    }
    return { name: text(name, "Nama lulusan"), skpiId, programStudy: text(programStudy, "Program studi"), totalSKP: total, predicate: predicate(total) }
  }

  private reason(v: string, label: string) {
    const t = (v ?? "").trim()
    if (!t) throw reject(`${label} wajib diisi`)
    if (t.length > 500 || /[\u0000-\u001f\u007f]/.test(t)) throw reject(`${label} tidak valid (maksimal 500 karakter, tanpa karakter kontrol)`)
    return t
  }

  private take(skpiId: string, npm: string) {
    const owner = this.index.get(skpiId)
    if (owner && owner !== npm) throw reject(`Nomor SKPI ${skpiId} sudah dipakai`)
    this.index.set(skpiId, npm)
  }

  /** Jalankan aturan tanpa menyimpan (endorsement). */
  private dryRun(identity: string, fn: string, args: string[]) {
    const snapshot = { state: new Map(this.state), index: new Map(this.index), history: new Map(this.history), height: this.height }
    try {
      this.apply(identity, fn, args, "dry-run")
    } finally {
      Object.assign(this, { height: snapshot.height })
      this.state.clear(); snapshot.state.forEach((v, k) => this.state.set(k, v))
      this.index.clear(); snapshot.index.forEach((v, k) => this.index.set(k, v))
      this.history.clear(); snapshot.history.forEach((v, k) => this.history.set(k, v))
    }
  }

  /**
   * Meniru SahkanDekanBatch/SahkanRektorBatch (onchain/chaincode/skpi/lib/skpiContract.js): peran -> masukan semua butir ->
   * keadaan semua butir -> penulisan; atomik, galat SEMUA butir dilaporkan sekaligus dalam satu pesan BATCH_DITOLAK:[...].
   */
  private applyBatch(who: Identity, fn: "SahkanDekanBatch" | "SahkanRektorBatch", json: string | undefined, txId: string): string {
    const dekan = fn === "SahkanDekanBatch"
    this.role(who, [dekan ? "dekan" : "rektor"])
    let list: unknown
    try {
      list = JSON.parse(json as string)
    } catch {
      throw reject("Batch bukan JSON yang valid")
    }
    if (!Array.isArray(list)) throw reject("Batch harus berupa JSON array")
    if (list.length === 0) throw reject("Batch kosong")
    if (list.length > 100) throw reject("Maksimal 100 butir per batch")

    const errors: Array<{ butir: number; npm: string; pesan: string }> = []
    const note = (i: number, x: unknown, e: unknown) => {
      const npm = typeof x === "string" ? x : typeof (x as { npm?: unknown } | null)?.npm === "string" ? (x as { npm: string }).npm : ""
      errors.push({ butir: i + 1, npm, pesan: (e as Error).message })
    }
    const seenNpm = new Set<string>()
    const seenId = new Set<string>()
    type Valid = { i: number; x: unknown; npm: string; d?: ReturnType<FakeLedger["data"]> }
    const valid: Valid[] = []
    list.forEach((x, i) => {
      try {
        let npm: string
        let d: Valid["d"]
        if (dekan) {
          if (x === null || typeof x !== "object" || Array.isArray(x)) throw reject("Butir harus berupa objek")
          const b = x as Record<string, unknown>
          if (typeof b.npm !== "string" || !/^\d{10}$/.test(b.npm)) throw reject("NPM harus 10 digit angka")
          npm = b.npm
          this.facultyOf(npm, who)
          d = this.data(who, [npm, b.name as string, b.skpiId as string, b.programStudy as string, String(b.totalSKP)])
          if (seenNpm.has(npm)) throw reject(`NPM ${npm} ganda dalam batch`)
          if (seenId.has(d.skpiId)) throw reject(`Nomor SKPI ${d.skpiId} ganda dalam batch`)
          seenId.add(d.skpiId)
        } else {
          if (typeof x !== "string" || !/^\d{10}$/.test(x)) throw reject("NPM harus 10 digit angka")
          npm = x
          if (seenNpm.has(npm)) throw reject(`NPM ${npm} ganda dalam batch`)
        }
        seenNpm.add(npm)
        valid.push({ i, x, npm, d })
      } catch (e) {
        note(i, x, e)
      }
    })
    const lapor = () => {
      if (errors.length > 0) throw reject(`BATCH_DITOLAK:${JSON.stringify(errors)}`)
    }
    lapor()

    for (const v of valid) {
      try {
        if (dekan) {
          const old = this.state.get(v.npm)
          if (old && old.status !== "DICABUT" && old.status !== "DITOLAK_REKTOR") throw reject(`NPM ${v.npm} sudah memiliki SKPI berstatus ${old.status}`)
          if (this.index.has(v.d!.skpiId)) throw reject(`Nomor SKPI ${v.d!.skpiId} sudah dipakai`)
        } else {
          this.status(this.must(v.npm), "MENUNGGU_REKTOR")
        }
      } catch (e) {
        note(v.i, v.x, e)
      }
    }
    lapor()

    const at = this.now().toISOString()
    const results: Asset[] = valid.map((v) => {
      let next: Asset
      if (dekan) {
        const d = v.d!
        this.index.set(d.skpiId, v.npm)
        next = {
          npm: v.npm, ...d, facultyCode: who.facultyCode!, unitCode: who.unitCode!, issuer: who.issuer!, issuedTimestamp: at, status: "MENUNGGU_REKTOR",
          dekanId: who.id, rektorId: "", rektorTimestamp: "", updatedTimestamp: "", revocationReason: "",
        }
      } else {
        next = { ...this.must(v.npm), status: "AKTIF", rektorId: who.id, rektorTimestamp: at }
      }
      this.state.set(v.npm, next)
      this.history.set(v.npm, [...(this.history.get(v.npm) ?? []), { txId, timestamp: at, isDelete: false, penandaTangan: who.id, data: next }])
      return next
    })
    this.height++
    return JSON.stringify(results)
  }

  private apply(identity: string, fn: string, args: string[], txId: string): string {
    const who = identityOf(identity)
    if (fn === "SahkanDekanBatch" || fn === "SahkanRektorBatch") return this.applyBatch(who, fn, args[0], txId)
    const npm = args[0]
    if (!/^\d{10}$/.test(npm ?? "")) throw reject("NPM harus 10 digit angka")
    const at = this.now().toISOString()
    let next: Asset
    if (fn === "SahkanDekan") {
      this.role(who, ["dekan"])
      this.facultyOf(npm, who)
      const d = this.data(who, args)
      const old = this.state.get(npm)
      if (old && old.status !== "DICABUT" && old.status !== "DITOLAK_REKTOR") throw reject(`NPM ${npm} sudah memiliki SKPI berstatus ${old.status}`)
      this.take(d.skpiId, npm)
      next = {
        npm, ...d, facultyCode: who.facultyCode!, unitCode: who.unitCode!, issuer: who.issuer!, issuedTimestamp: at, status: "MENUNGGU_REKTOR",
        dekanId: who.id, rektorId: "", rektorTimestamp: "", updatedTimestamp: "", revocationReason: "",
      }
    } else if (fn === "SahkanRektor" || fn === "TolakRektor") {
      this.role(who, ["rektor"])
      const reason = fn === "TolakRektor" ? this.reason(args[1], "Alasan penolakan") : ""
      const a = this.must(npm)
      this.status(a, "MENUNGGU_REKTOR")
      if (fn === "TolakRektor") this.index.delete(a.skpiId)
      next = fn === "SahkanRektor"
        ? { ...a, status: "AKTIF", rektorId: who.id, rektorTimestamp: at }
        : { ...a, status: "DITOLAK_REKTOR", rektorId: who.id, rektorTimestamp: at, revocationReason: reason }
    } else if (fn === "PerbaruiSKPI") {
      this.role(who, ["dekan"])
      this.facultyOf(npm, who)
      const d = this.data(who, args)
      const a = this.must(npm)
      this.status(a, "AKTIF")
      if (a.skpiId !== d.skpiId) {
        this.take(d.skpiId, npm)
        this.index.delete(a.skpiId)
      }
      next = { ...a, ...d, dekanId: who.id, updatedTimestamp: at }
    } else if (fn === "CabutSKPI") {
      this.role(who, ["dekan"])
      this.facultyOf(npm, who)
      const reason = this.reason(args[1], "Alasan pencabutan")
      const a = this.must(npm)
      this.status(a, "AKTIF")
      this.index.delete(a.skpiId)
      next = { ...a, status: "DICABUT", dekanId: who.id, revocationReason: reason }
    } else throw reject(`Fungsi ${fn} tidak dikenal`)

    this.state.set(npm, next)
    this.height++
    this.history.set(npm, [...(this.history.get(npm) ?? []), { txId, timestamp: at, isDelete: false, penandaTangan: who.id, data: next }])
    return JSON.stringify(next)
  }
}
