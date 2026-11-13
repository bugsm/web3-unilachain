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

describe("FakeLedger meniru chaincode batch (SahkanDekanBatch, SahkanRektorBatch)", () => {
  const item = (n: number, over: Record<string, unknown> = {}) => ({
    npm: `231705${1000 + n}`,
    name: `Lulusan ${n}`,
    skpiId: `${String(n).padStart(3, "0")}/UN26.17/SKPI/2026`,
    programStudy: "S1 Ilmu Komputer",
    totalSKP: 180,
    ...over,
  })
  const items = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1))
  const send = (l: FakeLedger, list: unknown, who = "dekan-fmipa", fn = "SahkanDekanBatch") => l.submit(who, fn, [JSON.stringify(list)])
  const galat = async (p: Promise<unknown>) => {
    const e = await rejection(p)
    expect(e.kind).to.equal("REJECTED")
    expect(e.message.startsWith("BATCH_DITOLAK:")).to.equal(true)
    return JSON.parse(e.message.slice("BATCH_DITOLAK:".length)) as Array<{ butir: number; npm: string; pesan: string }>
  }

  it("satu transaksi batch = SATU blok berisi semua aset, hasil array sesuai urutan masukan", async () => {
    const l = new FakeLedger()
    const before = await l.chainHeight()
    const { result } = await send(l, items(3))
    expect(JSON.parse(result).map((a: { npm: string }) => a.npm)).to.deep.equal(["2317051001", "2317051002", "2317051003"])
    expect(await l.chainHeight()).to.equal(before + 1)
    expect(l.blockSizes).to.deep.equal([1]) // satu transaksi
    expect(l.blockAssets).to.deep.equal([3]) // memuat tiga aset
    expect(l.state.size).to.equal(3)
    expect(l.index.get("002/UN26.17/SKPI/2026")).to.equal("2317051002")
  })

  it("riwayat tiap NPM mencatat txId transaksi batch yang sama dan penanda tangan dekan", async () => {
    const l = new FakeLedger()
    const { txId } = await send(l, items(2))
    for (const npm of ["2317051001", "2317051002"]) {
      const h = l.history.get(npm)!
      expect(h).to.have.length(1)
      expect(h[0].txId).to.equal(txId)
      expect(h[0].penandaTangan).to.match(/CN=dekan-fmipa/)
    }
  })

  it("asetnya sama dengan hasil SahkanDekan tunggal", async () => {
    const l = new FakeLedger()
    const { result } = await send(l, [item(1)])
    const lain = new FakeLedger()
    const tunggal = await lain.submit("dekan-fmipa", "SahkanDekan", ["2317051001", "Lulusan 1", "001/UN26.17/SKPI/2026", "S1 Ilmu Komputer", "180"])
    expect(JSON.parse(result)[0]).to.deep.equal(JSON.parse(tunggal.result))
  })

  it("menerima 100 butir, menolak 101 dan batch kosong", async () => {
    const l = new FakeLedger()
    expect(JSON.parse((await send(l, items(100))).result)).to.have.length(100)
    expect(l.blockAssets).to.deep.equal([100])
    expect((await rejection(send(new FakeLedger(), items(101)))).message).to.match(/Maksimal 100 butir/)
    expect((await rejection(send(new FakeLedger(), []))).message).to.match(/Batch kosong/)
  })

  it("melaporkan SEMUA butir yang salah sekaligus (indeks mulai dari 1), tanpa blok dan tanpa menulis state", async () => {
    const l = new FakeLedger()
    const before = await l.chainHeight()
    const out = await galat(send(l, [item(1, { npm: "123" }), item(2), item(3, { totalSKP: 24 }), item(4, { npm: "2311051004" })]))
    expect(out.map((g) => g.butir)).to.deep.equal([1, 3, 4])
    expect(out[0].pesan).to.match(/NPM harus 10 digit/)
    expect(out[1].pesan).to.match(/tidak memenuhi syarat/)
    expect(out[2].pesan).to.match(/^Akses ditolak: NPM 2311051004 bukan mahasiswa fakultas FMIPA/)
    expect(l.state.size).to.equal(0)
    expect(await l.chainHeight()).to.equal(before)
    expect(l.blockSizes).to.deep.equal([])
  })

  it("tahap keadaan: melaporkan SEMUA butir yang bertabrakan dengan state (sudah berstatus, nomor SKPI dipakai)", async () => {
    const l = new FakeLedger()
    await l.submit("dekan-fmipa", "SahkanDekan", ["2317051001", "X", "001/UN26.17/SKPI/2026", "S1 IK", "180"])
    const out = await galat(send(l, [item(1, { skpiId: "009/UN26.17/SKPI/2026" }), item(2, { skpiId: "001/UN26.17/SKPI/2026" }), item(3)]))
    expect(out.map((g) => g.butir)).to.deep.equal([1, 2])
    expect(out[0].pesan).to.match(/sudah memiliki SKPI berstatus MENUNGGU_REKTOR/)
    expect(out[1].pesan).to.match(/sudah dipakai/)
  })

  it("tahap masukan: butir ganda di dalam batch ditandai pada butir yang muncul belakangan, dilaporkan sebelum state diperiksa", async () => {
    const l = new FakeLedger()
    const out = await galat(send(l, [item(1), item(1, { skpiId: "008/UN26.17/SKPI/2026" }), item(3), item(4, { skpiId: item(1).skpiId })]))
    expect(out.map((g) => g.butir)).to.deep.equal([2, 4])
    expect(out[0].pesan).to.match(/NPM 2317051001 ganda dalam batch/)
    expect(out[1].pesan).to.match(/Nomor SKPI .* ganda dalam batch/)
  })

  it("peran salah ditolak dengan Akses ditolak (pesan biasa, bukan BATCH_DITOLAK)", async () => {
    const l = new FakeLedger()
    expect((await rejection(send(l, items(1), "rektor"))).message).to.match(/^Akses ditolak/)
    expect((await rejection(send(l, ["2317051001"], "dekan-fmipa", "SahkanRektorBatch"))).message).to.match(/^Akses ditolak/)
  })

  it("SahkanRektorBatch: semua MENUNGGU_REKTOR menjadi AKTIF dalam satu blok", async () => {
    const l = new FakeLedger()
    await send(l, items(3))
    l.blockSizes.length = 0
    l.blockAssets.length = 0
    const before = await l.chainHeight()
    const { result } = await send(l, ["2317051003", "2317051001", "2317051002"], "rektor", "SahkanRektorBatch")
    expect(JSON.parse(result).map((a: { npm: string; status: string }) => [a.npm, a.status])).to.deep.equal([
      ["2317051003", "AKTIF"], ["2317051001", "AKTIF"], ["2317051002", "AKTIF"],
    ])
    expect(await l.chainHeight()).to.equal(before + 1)
    expect(l.blockAssets).to.deep.equal([3])
    expect(l.history.get("2317051001")).to.have.length(2)
  })

  it("SahkanRektorBatch tahap keadaan: melaporkan SEMUA yang tidak ada atau bukan MENUNGGU_REKTOR", async () => {
    const l = new FakeLedger()
    await send(l, items(3))
    await l.submit("rektor", "SahkanRektor", ["2317051002"])
    const out = await galat(send(l, ["2317051001", "2317051002", "2317059999", "2317051003"], "rektor", "SahkanRektorBatch"))
    expect(out.map((g) => g.butir)).to.deep.equal([2, 3])
    expect(out[0].pesan).to.match(/berstatus AKTIF, seharusnya MENUNGGU_REKTOR/)
    expect(out[1].pesan).to.match(/tidak ditemukan/)
    expect(l.state.get("2317051001")!.status).to.equal("MENUNGGU_REKTOR")
  })

  it("SahkanRektorBatch tahap masukan: bukan NPM dan NPM ganda dilaporkan sekaligus", async () => {
    const l = new FakeLedger()
    await send(l, items(2))
    const out = await galat(send(l, ["2317051001", "abc", 42, "2317051001", "2317051002"], "rektor", "SahkanRektorBatch"))
    expect(out.map((g) => g.butir)).to.deep.equal([2, 3, 4])
    expect(out[0].pesan).to.match(/NPM harus 10 digit/)
    expect(out[1].pesan).to.match(/NPM harus 10 digit/)
    expect(out[2].pesan).to.match(/NPM 2317051001 ganda dalam batch/)
  })

  it("ditolak saat endorse: onSubmitting tidak dipanggil dan tidak ada blok", async () => {
    const l = new FakeLedger()
    let dipanggil = false
    await rejection(l.submit("dekan-fmipa", "SahkanDekanBatch", [JSON.stringify([item(1, { totalSKP: 1 })])], async () => { dipanggil = true }))
    expect(dipanggil).to.equal(false)
    expect(l.blockSizes).to.deep.equal([])
  })

  it("COMMIT_UNKNOWN terjadwal memengaruhi seluruh batch: tercatat (applied) atau tidak, txId dibawa", async () => {
    const l = new FakeLedger()
    l.failNextSubmitWith("COMMIT_UNKNOWN", { applied: true })
    const e = await rejection(send(l, items(2)))
    expect(e).to.include({ kind: "COMMIT_UNKNOWN" })
    expect(l.state.size).to.equal(2)
    expect(await l.txStatus(e.txId!)).to.equal("COMMITTED")
    expect(l.blockAssets).to.deep.equal([2])
  })
})
