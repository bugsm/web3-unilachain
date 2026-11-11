import { expect } from "chai"
import { LedgerError } from "../../src/fabric/ledger.js"
import { FakeLedger } from "../helpers/fakeLedger.js"

const args = (npm = "2017051008", skpiId = "001/UN26.17/SKPI/2026") => [npm, "Nabila Azzahra", skpiId, "S1 Ilmu Komputer", "236"]

async function rejection(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    return e as LedgerError
  }
  throw new Error("seharusnya ditolak")
}

describe("FakeLedger meniru chaincode", () => {
  it("alur SahkanDekan → SahkanRektor → VerifikasiSKPI", async () => {
    const l = new FakeLedger()
    const { result } = await l.submit("dekan-fmipa", "SahkanDekan", args())
    expect(JSON.parse(result)).to.deep.include({ status: "MENUNGGU_REKTOR", predicate: "Unggul", facultyCode: "FMIPA", issuer: "Dekan Fakultas Matematika dan Ilmu Pengetahuan Alam" })
    expect(JSON.parse(await l.evaluate("app-reader", "VerifikasiSKPI", ["2017051008"]))).to.deep.equal({ status: "BELUM_SAH", data: null })
    await l.submit("rektor", "SahkanRektor", ["2017051008"])
    const v = JSON.parse(await l.evaluate("app-reader", "VerifikasiSKPI", ["2017051008"]))
    expect(v.status).to.equal("TERDAFTAR")
    expect(v.data).to.not.have.property("revocationReason")
    expect(await l.chainHeight()).to.equal(1202)
  })

  it("menolak dekan fakultas lain, kode unit salah, nomor ganda, peran salah", async () => {
    const l = new FakeLedger()
    expect((await rejection(l.submit("dekan-ft", "SahkanDekan", args()))).message).to.match(/^Akses ditolak: NPM 2017051008 bukan mahasiswa fakultas FT/)
    expect((await rejection(l.submit("dekan-fmipa", "SahkanDekan", args("2017051008", "001/UN26.15/SKPI/2026")))).message).to.match(/Kode unit/)
    await l.submit("dekan-fmipa", "SahkanDekan", args())
    expect((await rejection(l.submit("dekan-fmipa", "SahkanDekan", args("2017051021")))).message).to.equal("Nomor SKPI 001/UN26.17/SKPI/2026 sudah dipakai")
    expect((await rejection(l.submit("app-reader", "SahkanRektor", ["2017051008"]))).message).to.match(/^Akses ditolak: peran reader/)
    expect((await rejection(l.evaluate("dekan-ft", "BacaSKPI", ["2017051008"]))).message).to.match(/^Akses ditolak/)
  })

  it("offline dan kegagalan terjadwal", async () => {
    const l = new FakeLedger()
    l.setOnline(false)
    expect((await rejection(l.chainHeight())).kind).to.equal("UNAVAILABLE")
    l.setOnline(true)
    l.failNextSubmitWith("COMMIT_UNKNOWN", { applied: true })
    const e = await rejection(l.submit("dekan-fmipa", "SahkanDekan", args()))
    expect(e.kind).to.equal("COMMIT_UNKNOWN")
    expect(await l.txStatus(e.txId!)).to.equal("COMMITTED")
    expect(JSON.parse(await l.evaluate("rektor", "BacaSKPI", ["2017051008"])).status).to.equal("MENUNGGU_REKTOR")
  })

  it("onSubmitting dipanggil dengan txId sebelum commit, tidak dipanggil bila endorse ditolak", async () => {
    const l = new FakeLedger()
    const seen: string[] = []
    const { txId } = await l.submit("dekan-fmipa", "SahkanDekan", args(), async (id) => {
      seen.push(id)
      expect(l.state.has("2017051008")).to.equal(false)
    })
    expect(seen).to.deep.equal([txId])
    await rejection(l.submit("dekan-ft", "SahkanDekan", args("2015061003"), async (id) => void seen.push(id)))
    expect(seen).to.have.length(1)
  })

  it("riwayat memuat txId dan penanda tangan", async () => {
    const l = new FakeLedger()
    const a = await l.submit("dekan-fmipa", "SahkanDekan", args())
    const b = await l.submit("rektor", "SahkanRektor", ["2017051008"])
    const h = JSON.parse(await l.evaluate("dekan-fmipa", "RiwayatSKPI", ["2017051008"]))
    expect(h.map((x: { txId: string }) => x.txId)).to.deep.equal([a.txId, b.txId])
    expect(h[1].penandaTangan).to.match(/CN=rektor/)
  })
})
