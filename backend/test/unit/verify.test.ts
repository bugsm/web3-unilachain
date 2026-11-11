import { expect } from "chai"
import { assets } from "../../src/db/repos/assets.js"
import { testConfig } from "../helpers/app.js"
import { expectApiError, startContract } from "../helpers/contract.js"
import { FakeLedger } from "../helpers/fakeLedger.js"

const args = ["2017051008", "Nabila Azzahra", "001/UN26.17/SKPI/2026", "S1 Ilmu Komputer", "236"]

describe("verifikasi publik dan info ledger", () => {
  it("nama pejabat dipilih dari periode jabatan saat pengesahan", async () => {
    const ledger = new FakeLedger(() => new Date("2026-10-13T11:00:00.000Z"))
    const { client, pool } = await startContract({ ledger })
    await ledger.submit("dekan-fmipa", "SahkanDekan", args)
    await ledger.submit("rektor", "SahkanRektor", ["2017051008"])
    // Dekan FMIPA diganti setelah pengesahan: hasil tetap memakai nama pejabat lama.
    await pool.query("UPDATE official_periods SET to_date = '2026-10-31' WHERE office = 'FMIPA'")
    await pool.query("INSERT INTO official_periods (office, name, from_date) VALUES ('FMIPA', 'Dekan Baru', '2026-11-01')")
    const v = await client.verify("2017051008")
    expect(v.status).to.equal("TERDAFTAR")
    expect(v.dekanName).to.equal("Dr. Eng. Heri Satria, S.Si., M.Si.")
    expect(v.rektorName).to.equal("Prof. Dr. Ir. Lusmeilia Afriani, D.E.A., IPM., ASEAN Eng.")
  })

  it("selalu membaca ledger: peer mati → 503 walau proyeksi berisi aset", async () => {
    const ledger = new FakeLedger()
    const { client, pool } = await startContract({ ledger })
    await ledger.submit("dekan-fmipa", "SahkanDekan", args)
    await ledger.submit("rektor", "SahkanRektor", ["2017051008"])
    await assets.upsert(pool, JSON.parse(await ledger.evaluate("rektor", "BacaSKPI", ["2017051008"])))
    ledger.setOnline(false)
    const e = await expectApiError(client.verify("2017051008"), 503)
    expect(e.message).to.equal("Layanan ledger sedang tidak terjangkau.")
  })

  it("pencarian: % tidak menjadi wildcard, < 3 huruf → 400", async () => {
    const ledger = new FakeLedger()
    const { client, pool } = await startContract({ ledger })
    await ledger.submit("dekan-fmipa", "SahkanDekan", args)
    await assets.upsert(pool, JSON.parse(await ledger.evaluate("rektor", "BacaSKPI", ["2017051008"])))
    expect((await client.searchPublic("%%%")).candidates).to.have.length(0)
    expect((await client.searchPublic("nabila")).candidates.map((c) => c.npm)).to.deep.equal(["2017051008"])
    await expectApiError(client.searchPublic("ri"), 400)
  })

  it("info ledger: {channel, msp, height, checkedAt}; 503 bila peer mati", async () => {
    const ledger = new FakeLedger(() => new Date("2026-11-12T01:00:00.000Z"))
    const { client } = await startContract({ ledger, now: () => new Date("2026-11-12T01:00:00.000Z") })
    expect(await client.ledgerInfo()).to.deep.equal({ channel: "skpi-channel", msp: "UnilaMSP", height: 1200, checkedAt: "2026-11-12T01:00:00.000Z" })
    ledger.setOnline(false)
    await expectApiError(client.ledgerInfo(), 503)
  })

  it("verifikasi dibatasi per menit per IP (429)", async () => {
    const { buildTestApp } = await import("../helpers/app.js")
    const request = (await import("supertest")).default
    const { app } = await buildTestApp({ ledger: new FakeLedger(), config: { ...testConfig, verifyRateLimitPerMin: 2 } })
    await request(app).get("/api/verify/2017051008")
    await request(app).get("/api/verify?q=nabila")
    const res = await request(app).get("/api/verify/2017051008")
    expect(res.status).to.equal(429)
  })
})
