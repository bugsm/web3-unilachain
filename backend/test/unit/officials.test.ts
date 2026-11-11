import { expect } from "chai"
import { expectApiError, startContract } from "../helpers/contract.js"
import { FakeLedger } from "../helpers/fakeLedger.js"

const NOW = () => new Date("2026-11-11T05:00:00Z") // 11 Nov 2026 12.00 WIB
const LUSMEILIA = "Prof. Dr. Ir. Lusmeilia Afriani, D.E.A., IPM., ASEAN Eng."

async function setup() {
  const ledger = new FakeLedger(() => new Date("2026-10-13T11:00:00.000Z"))
  const c = await startContract({ ledger, now: NOW })
  const rektor = async () => (await c.client.listOfficials()).find((o) => o.office === "REKTOR")!
  return { ...c, rektor }
}

describe("pejabat penanda tangan", () => {
  it("data awal 9 jabatan; tanpa sesi 401", async () => {
    const { client, loginAs } = await setup()
    await expectApiError(client.listOfficials(), 401)
    await loginAs("dekan.fmipa@unila.ac.id")
    const all = await client.listOfficials()
    expect(all.map((o) => o.office)).to.deep.equal(["REKTOR", "FEB", "FH", "FKIP", "FP", "FT", "FISIP", "FMIPA", "FK"])
    expect(all[0].periods).to.have.length(1)
    expect(all[0].periods[0]).to.deep.include({ name: LUSMEILIA, from: "2023-01-01", to: null })
    expect(all[0].lastChange).to.equal(null)
  })

  it("wewenang: admin lain fakultas 403, dekan/rektor 403", async () => {
    const { client, loginAs } = await setup()
    await loginAs("admin.ft@unila.ac.id")
    const fmipa = (await client.listOfficials()).find((o) => o.office === "FMIPA")!
    await expectApiError(client.correctOfficial("FMIPA", fmipa.periods[0].id, "Dr. Siapa Saja"), 403)
    await loginAs("dekan.fmipa@unila.ac.id")
    await expectApiError(client.correctOfficial("FMIPA", fmipa.periods[0].id, "Dr. Siapa Saja"), 403)
    await loginAs("rektor@unila.ac.id")
    await expectApiError(client.replaceOfficial("REKTOR", "Rektor Baru", "2026-11-01"), 403)
  })

  it("koreksi rektor oleh admin fakultas mana pun tercatat; nama tidak valid 400; jabatan tak dikenal 404", async () => {
    const { client, loginAs, rektor } = await setup()
    await loginAs("admin.ft@unila.ac.id")
    const r = await rektor()
    const after = await client.correctOfficial("REKTOR", r.periods[0].id, "  Prof. Dr. Ir. Lusmeilia   Afriani ")
    expect(after.periods[0].name).to.equal("Prof. Dr. Ir. Lusmeilia Afriani")
    expect(after.lastChange).to.deep.include({ kind: "KOREKSI", office: "REKTOR", before: LUSMEILIA, after: "Prof. Dr. Ir. Lusmeilia Afriani", by: "admin.ft (off-chain)" })
    await expectApiError(client.correctOfficial("REKTOR", r.periods[0].id, "ab"), 400)
    await expectApiError(client.correctOfficial("REKTOR", "999999", "Nama Lain Sekali"), 404)
    await expectApiError(client.correctOfficial("FT", r.periods[0].id, "Nama Lain Sekali"), 404)
    await expectApiError(client.correctOfficial("XYZ" as never, r.periods[0].id, "Nama Lain Sekali"), 404)
  })

  it("pergantian: tanggal tidak sah 409, sah menutup periode lama", async () => {
    const { client, loginAs } = await setup()
    await loginAs("admin.fmipa@unila.ac.id")
    await expectApiError(client.replaceOfficial("REKTOR", "Rektor Baru, M.Sc.", "2026-11-12"), 409)
    await expectApiError(client.replaceOfficial("REKTOR", "Rektor Baru, M.Sc.", "2023-01-01"), 409)
    await expectApiError(client.replaceOfficial("REKTOR", "Rektor Baru, M.Sc.", "2026-02-30"), 409)
    const after = await client.replaceOfficial("REKTOR", "Rektor Baru, M.Sc.", "2026-11-01")
    expect(after.periods.map((p) => [p.name, p.from, p.to])).to.deep.equal([
      [LUSMEILIA, "2023-01-01", "2026-10-31"],
      ["Rektor Baru, M.Sc.", "2026-11-01", null],
    ])
    expect(after.lastChange).to.deep.include({ kind: "PERGANTIAN", before: LUSMEILIA, after: "Rektor Baru, M.Sc.", by: "admin.fmipa (off-chain)" })
  })

  it("verifikasi memakai nama pejabat saat pengesahan; koreksi periode lama ikut", async () => {
    const { client, loginAs, rektor, ledger } = await setup()
    await ledger.submit("dekan-fmipa", "SahkanDekan", ["2017051008", "Nabila Azzahra", "001/UN26.17/SKPI/2026", "S1 Ilmu Komputer", "236"])
    await ledger.submit("rektor", "SahkanRektor", ["2017051008"])
    let v = await client.verify("2017051008")
    expect(v.dekanName).to.equal("Dr. Eng. Heri Satria, S.Si., M.Si.")
    expect(v.rektorName).to.equal(LUSMEILIA)
    await loginAs("admin.fmipa@unila.ac.id")
    await client.replaceOfficial("REKTOR", "Rektor Baru, M.Sc.", "2026-11-01")
    const old = (await rektor()).periods[0]
    await client.correctOfficial("REKTOR", old.id, "Prof. Lusmeilia Afriani (koreksi)")
    await client.logout()
    v = await client.verify("2017051008")
    expect(v.rektorName).to.equal("Prof. Lusmeilia Afriani (koreksi)")
    await loginAs("admin.fmipa@unila.ac.id")
    const changes = await client.officialChanges("REKTOR")
    expect(changes.map((x) => x.kind)).to.deep.equal(["KOREKSI", "PERGANTIAN"])
  })

  it("koreksi tanpa perubahan nama ditolak dan tidak tercatat", async () => {
    const { client, loginAs } = await setup()
    await loginAs("admin.fmipa@unila.ac.id")
    const r = (await client.listOfficials())[0]
    await expectApiError(client.correctOfficial("REKTOR", r.periods[0].id, `  ${r.periods[0].name}  `), 400)
    expect((await client.listOfficials())[0].lastChange).to.equal(null)
  })
})
