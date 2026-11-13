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

describe("FakeLedger.submitBatch", () => {
  const item = (npm: string, skpiId: string) => ({ fn: "SahkanDekan", args: args(npm, skpiId) })
  const batch = [
    item("2017051008", "001/UN26.17/SKPI/2026"),
    item("2017051021", "002/UN26.17/SKPI/2026"),
    item("2017051033", "003/UN26.17/SKPI/2026"),
  ]

  it("semua transaksi dalam satu batch masuk SATU blok", async () => {
    const l = new FakeLedger()
    const before = await l.chainHeight()
    const out = await l.submitBatch("dekan-fmipa", batch)
    expect(out.every((r) => r.ok)).to.equal(true)
    expect(out.map((r) => (r.ok ? JSON.parse(r.result).npm : null))).to.deep.equal(["2017051008", "2017051021", "2017051033"])
    expect(await l.chainHeight()).to.equal(before + 1)
    expect(l.blockSizes).to.deep.equal([3])
    expect(l.state.size).to.equal(3)
  })

  it("submit tunggal tetap satu blok per transaksi", async () => {
    const l = new FakeLedger()
    await l.submit("dekan-fmipa", "SahkanDekan", args())
    expect(l.blockSizes).to.deep.equal([1])
  })

  it("onSubmitting dipanggil per item yang lolos endorse dengan indeks dan txId yang sama dengan hasilnya", async () => {
    const l = new FakeLedger()
    const seen: Array<[number, string]> = []
    const out = await l.submitBatch("dekan-fmipa", batch, async (i, id) => {
      seen.push([i, id])
    })
    expect(seen.map(([i]) => i)).to.deep.equal([0, 1, 2])
    expect(seen.map(([, id]) => id)).to.deep.equal(out.map((r) => (r.ok ? r.txId : "")))
  })

  it("item yang ditolak chaincode (endorse) tidak ikut blok dan tidak mengganggu yang lain", async () => {
    const l = new FakeLedger()
    const out = await l.submitBatch("dekan-fmipa", [batch[0], item("2015051001", "009/UN26.17/SKPI/2026"), batch[2]])
    expect(out.map((r) => r.ok)).to.deep.equal([true, false, true])
    const bad = out[1]
    if (!bad.ok) expect(bad.error.message).to.match(/^Akses ditolak: NPM 2015051001 bukan mahasiswa fakultas FMIPA/)
    expect(l.blockSizes).to.deep.equal([2])
    expect(l.state.has("2015051001")).to.equal(false)
  })

  it("nomor SKPI ganda di dalam batch yang sama: yang kedua gagal commit (konflik MVCC) di blok yang sama", async () => {
    const l = new FakeLedger()
    const out = await l.submitBatch("dekan-fmipa", [item("2017051008", "001/UN26.17/SKPI/2026"), item("2017051021", "001/UN26.17/SKPI/2026")])
    expect(out.map((r) => r.ok)).to.deep.equal([true, false])
    const dup = out[1]
    if (!dup.ok) expect(dup.error).to.include({ kind: "REJECTED" })
    expect(l.blockSizes).to.deep.equal([1])
  })

  it("COMMIT_UNKNOWN terjadwal per item: tercatat atau tidak sesuai opsi, txId dibawa untuk rekonsiliasi", async () => {
    const l = new FakeLedger()
    l.failBatchItemWith(1, "COMMIT_UNKNOWN", { applied: true })
    l.failBatchItemWith(2, "COMMIT_UNKNOWN", { applied: false })
    const out = await l.submitBatch("dekan-fmipa", batch)
    expect(out[0].ok).to.equal(true)
    for (const i of [1, 2]) {
      const r = out[i]
      expect(r.ok).to.equal(false)
      if (!r.ok) {
        expect(r.error.kind).to.equal("COMMIT_UNKNOWN")
        expect(r.error.txId).to.match(/^[0-9a-f]{64}$/)
        expect(await l.txStatus(r.error.txId!)).to.equal(i === 1 ? "COMMITTED" : "INVALID")
      }
    }
    expect(l.state.has("2017051021")).to.equal(true)
    expect(l.state.has("2017051033")).to.equal(false)
  })

  it("offline: semua item UNAVAILABLE dan tidak ada yang tertulis", async () => {
    const l = new FakeLedger()
    l.setOnline(false)
    const out = await l.submitBatch("dekan-fmipa", batch)
    expect(out.map((r) => (r.ok ? "ok" : r.error.kind))).to.deep.equal(["UNAVAILABLE", "UNAVAILABLE", "UNAVAILABLE"])
    expect(l.state.size).to.equal(0)
  })
})

