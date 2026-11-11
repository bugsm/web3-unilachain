import { expect } from "chai"
import { assets, type LedgerAsset } from "../../src/db/repos/assets.js"
import { drafts } from "../../src/db/repos/drafts.js"
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

  it("data awal pejabat berisi 9 jabatan", async () => {
    const db = await resetDb()
    const list = await officials.list(db)
    expect(list).to.have.length(9)
    expect(list.find((o) => o.office === "REKTOR")?.periods[0].from).to.equal("2023-01-01")
  })
})
