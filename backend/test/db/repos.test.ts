import { expect } from "chai"
import { assets, type LedgerAsset } from "../../src/db/repos/assets.js"
import { drafts } from "../../src/db/repos/drafts.js"
import { ledgerTx } from "../../src/db/repos/ledgerTx.js"
import { officials } from "../../src/db/repos/officials.js"
import { users } from "../../src/db/repos/users.js"
import { resetDb } from "../helpers/db.js"

const asset = (npm: string, name: string, status: LedgerAsset["status"] = "AKTIF"): LedgerAsset => ({
  npm, name, skpiId: `0${npm.slice(-2)}/UN26.17/SKPI/2026`, programStudy: "S1 Ilmu Komputer", totalSKP: 180,
  predicate: "Sangat Baik", facultyCode: "FMIPA", unitCode: "UN26.17", issuer: "Dekan FMIPA",
  issuedTimestamp: "2026-10-13T11:00:00.000Z", status, dekanId: "x", rektorId: "", rektorTimestamp: "",
  updatedTimestamp: "", revocationReason: "",
})

describe("repositori PostgreSQL", () => {
  it("akun ditemukan lewat email (spasi & huruf besar diabaikan), NIP, atau NIDN", async () => {
    const db = await resetDb()
    await users.create(db, { email: "admin.fmipa@unila.ac.id", nip: "198001012005011001", nidn: null, passwordHash: "h", name: "Admin FMIPA", role: "admin", faculty: "FMIPA", fabricIdentity: null })
    expect((await users.findByIdentifier(db, " Admin.FMIPA@unila.ac.id "))?.name).to.equal("Admin FMIPA")
    expect((await users.findByIdentifier(db, "198001012005011001"))?.email).to.equal("admin.fmipa@unila.ac.id")
    expect(await users.findByIdentifier(db, "tidak@ada.id")).to.equal(null)
  })

  it("pencarian nama memakai proyeksi dan tidak memperlakukan % sebagai wildcard", async () => {
    const db = await resetDb()
    await assets.upsert(db, asset("2017051021", "Rizky Maulana"))
    await assets.upsert(db, asset("2015061003", "Rizky Maulana Putra"))
    await assets.upsert(db, asset("2017051008", "Nabila Azzahra"))
    const hits = await assets.searchByName(db, "rizky", 11)
    expect(hits.map((h) => h.npm).sort()).to.deep.equal(["2015061003", "2017051021"])
    expect(await assets.searchByName(db, "%%%", 11)).to.deep.equal([])
    expect((await assets.get(db, "2017051008"))?.name).to.equal("Nabila Azzahra")
  })

  it("upsert memperbarui aset yang sama", async () => {
    const db = await resetDb()
    await assets.upsert(db, asset("2017051008", "Nabila Azzahra", "MENUNGGU_REKTOR"))
    await assets.upsert(db, asset("2017051008", "Nabila Azzahra", "AKTIF"))
    expect((await assets.get(db, "2017051008"))?.status).to.equal("AKTIF")
  })

  it("nomor SKPI di draft tertunda dianggap terpakai, draft DIGANTIKAN tidak", async () => {
    const db = await resetDb()
    const data = { name: "A", skpiId: "007/UN26.17/SKPI/2026", programStudy: "S1 Ilmu Komputer", totalSKP: 100 }
    const d = await drafts.insert(db, { type: "PENCATATAN", npm: "2017051071", facultyCode: "FMIPA", data, reason: null, createdBy: "admin", at: "2026-11-12T00:00:00.000Z" })
    expect(await drafts.skpiIdTaken(db, "007/UN26.17/SKPI/2026", "2017059999")).to.equal(true)
    expect(await drafts.skpiIdTaken(db, "007/UN26.17/SKPI/2026", "2017051071")).to.equal(false)
    await drafts.update(db, d.id, { status: "DIGANTIKAN" })
    expect(await drafts.skpiIdTaken(db, "007/UN26.17/SKPI/2026", "2017059999")).to.equal(false)
  })

  describe("ledger_tx: satu baris per SKPI dalam satu transaksi", () => {
    const TX = "a".repeat(64)
    const items = ["2317051001", "2317051002", "2317051003"].map((npm) => ({ npm, draftId: null, fn: "SahkanRektor" }))
    const FAR = "9999-01-01T00:00:00.000Z"

    it("transaksi batch mencatat satu baris per NPM, semuanya PENDING, dan terlihat sebagai tertunda per NPM", async () => {
      const db = await resetDb()
      await ledgerTx.beginMany(db, { txId: TX, identity: "rektor", items })
      expect((await ledgerTx.pending(db, FAR)).map((r) => r.npm).sort()).to.deep.equal(items.map((i) => i.npm))
      expect((await ledgerTx.pending(db, FAR)).every((r) => r.txId === TX && r.fn === "SahkanRektor" && r.identity === "rektor")).to.equal(true)
      for (const i of items) expect(await ledgerTx.pendingForNpm(db, i.npm)).to.equal(true)
      expect(await ledgerTx.pendingForNpm(db, "2317059999")).to.equal(false)
    })

    it("klaim COMMITTED dilakukan per (transaksi, NPM): yang kedua kali ditolak, NPM lain tidak terpengaruh", async () => {
      const db = await resetDb()
      await ledgerTx.beginMany(db, { txId: TX, identity: "rektor", items })
      expect(await ledgerTx.claimCommitted(db, TX, "2317051001")).to.equal(true)
      expect(await ledgerTx.claimCommitted(db, TX, "2317051001")).to.equal(false)
      expect(await ledgerTx.pendingForNpm(db, "2317051001")).to.equal(false)
      expect(await ledgerTx.pendingForNpm(db, "2317051002")).to.equal(true)
    })

    it("finish tanpa NPM menyelesaikan semua baris transaksi; dengan NPM hanya baris itu", async () => {
      const db = await resetDb()
      await ledgerTx.beginMany(db, { txId: TX, identity: "rektor", items })
      await ledgerTx.finish(db, TX, "FAILED", "satu baris", "2317051002")
      expect((await ledgerTx.pending(db, FAR)).map((r) => r.npm).sort()).to.deep.equal(["2317051001", "2317051003"])
      await ledgerTx.finish(db, TX, "FAILED", "semua")
      expect(await ledgerTx.pending(db, FAR)).to.deep.equal([])
    })

    it("begin tunggal tetap bekerja; pasangan (transaksi, NPM) yang sama tidak boleh ganda", async () => {
      const db = await resetDb()
      await ledgerTx.begin(db, { txId: TX, draftId: null, npm: "2317051001", fn: "SahkanRektor", identity: "rektor" })
      let galat = ""
      try {
        await ledgerTx.begin(db, { txId: TX, draftId: null, npm: "2317051001", fn: "SahkanRektor", identity: "rektor" })
      } catch (e) {
        galat = (e as Error).message
      }
      expect(galat).to.match(/duplicate key|unique/i)
      await ledgerTx.begin(db, { txId: TX, draftId: null, npm: "2317051002", fn: "SahkanRektor", identity: "rektor" })
    })

    it("beginMany bersifat atomik: bila satu baris gagal, tidak ada yang tersimpan", async () => {
      const db = await resetDb()
      let galat = false
      try {
        await ledgerTx.beginMany(db, { txId: TX, identity: "rektor", items: [items[0], items[0]] })
      } catch {
        galat = true
      }
      expect(galat).to.equal(true)
      expect(await ledgerTx.pending(db, FAR)).to.deep.equal([])
    })
  })

  it("data awal pejabat berisi 9 jabatan", async () => {
    const db = await resetDb()
    const list = await officials.list(db)
    expect(list).to.have.length(9)
    expect(list.find((o) => o.office === "REKTOR")?.periods[0].from).to.equal("2023-01-01")
  })
})
