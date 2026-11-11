/*
 * Skenario frontend/src/api/mock/mockClient.test.ts diporting ke backend sungguhan (klien HTTP production frontend).
 * Perilaku backend dan klien mock dipaksa sama.
 */
import { expect } from "chai"
import type { ApiClient } from "../../../frontend/src/api/client"
import type { SkpiInput } from "../../src/domain/skpi.js"
import { expectApiError, startContract } from "../helpers/contract.js"

const input = (over: Partial<SkpiInput> = {}): SkpiInput => ({
  npm: "2317051001",
  name: "Nabila Azzahra",
  skpiId: "001/UN26.17/SKPI/2026",
  programStudy: "S1 Ilmu Komputer",
  totalSKP: 180,
  ...over,
})
const data = ({ npm: _n, ...rest }: SkpiInput) => rest

let client: ApiClient
let loginAs: (email: string) => Promise<unknown>

async function submit(i: SkpiInput) {
  await loginAs("admin.fmipa@unila.ac.id")
  return client.createDraft({ type: "PENCATATAN", npm: i.npm, data: data(i) })
}

async function activate(i: SkpiInput) {
  const d = await submit(i)
  await loginAs("dekan.fmipa@unila.ac.id")
  await client.approveDraft(d.id)
  await loginAs("rektor@unila.ac.id")
  await client.rektorApprove(i.npm)
}

describe("penerimaan: skenario klien mock", () => {
  beforeEach(async () => {
    const c = await startContract()
    client = c.client
    loginAs = c.loginAs
  })

  it("tanpa sesi → 401", async () => {
    await expectApiError(client.listRecords(), 401)
  })

  it("2. admin mengajukan draft pencatatan fakultasnya", async () => {
    await submit(input())
    const records = await client.listRecords()
    expect(records).to.have.length(1)
    expect(records[0]).to.deep.include({ npm: "2317051001", status: "MENUNGGU_DEKAN", predicate: "Sangat Baik" })
    await expectApiError(
      client.createDraft({ type: "PENCATATAN", npm: "2315051001", data: data(input({ npm: "2315051001", skpiId: "001/UN26.15/SKPI/2026" })) }),
      403,
    )
    await expectApiError(client.createDraft({ type: "PENCATATAN", npm: "2317051002", data: data(input({ npm: "2317051002", totalSKP: 20 })) }), 400)
  })

  it("3. dekan menyetujui → transaksi SahkanDekan", async () => {
    await submit(input())
    await loginAs("dekan.fmipa@unila.ac.id")
    const queue = await client.listQueue()
    expect(queue).to.have.length(1)
    const item = queue[0]
    if (item.kind !== "draft") throw new Error("harus draft")
    const { txId } = await client.approveDraft(item.draft.id)
    expect(txId).to.match(/^[0-9a-f]{64}$/)
    const rec = await client.getRecord("2317051001")
    expect(rec.status).to.equal("MENUNGGU_REKTOR")
    expect(rec.issuedTimestamp).to.be.ok
    expect(rec.history.map((h) => [h.action, h.kind])).to.deep.equal([
      ["DIAJUKAN", "offchain"],
      ["SahkanDekan", "ledger"],
    ])
    expect(rec.history[1].txId).to.equal(txId)
    expect(rec.history[1].actor).to.equal("dekan-fmipa@UnilaMSP")
    expect(rec.history[0].txId).to.equal(null)
  })

  it("4. dekan fakultas lain tidak melihat dan tidak bisa menyetujui", async () => {
    const d = await submit(input())
    await loginAs("dekan.ft@unila.ac.id")
    expect(await client.listQueue()).to.have.length(0)
    await expectApiError(client.approveDraft(d.id), 403)
    await expectApiError(client.getRecord("2317051001"), 404)
  })

  it("5. penolakan dekan hanya off-chain dan dapat diajukan ulang", async () => {
    const d = await submit(input())
    await loginAs("dekan.fmipa@unila.ac.id")
    await expectApiError(client.rejectDraft(d.id, "pendek"), 400)
    await client.rejectDraft(d.id, "Nomor SKPI tidak sesuai dokumen")
    let rec = await client.getRecord("2317051001")
    expect(rec.status).to.equal("DITOLAK_DEKAN")
    expect(rec.reason).to.equal("Nomor SKPI tidak sesuai dokumen")
    expect(rec.history.some((h) => h.kind === "ledger")).to.equal(false)
    await loginAs("admin.fmipa@unila.ac.id")
    await client.updateDraft(d.id, data(input({ skpiId: "002/UN26.17/SKPI/2026" })))
    rec = await client.getRecord("2317051001")
    expect(rec.status).to.equal("MENUNGGU_DEKAN")
    expect(rec.skpiId).to.equal("002/UN26.17/SKPI/2026")
  })

  it("6. rektor mengesahkan atau menolak", async () => {
    await activate(input())
    expect((await client.getRecord("2317051001")).status).to.equal("AKTIF")
    const other = input({ npm: "2317051002", skpiId: "002/UN26.17/SKPI/2026" })
    const d = await submit(other)
    await loginAs("dekan.fmipa@unila.ac.id")
    await client.approveDraft(d.id)
    await loginAs("rektor@unila.ac.id")
    await expectApiError(client.rektorReject(other.npm, "x"), 400)
    await client.rektorReject(other.npm, "Data SKP belum lengkap di lampiran")
    const rec = await client.getRecord(other.npm)
    expect(rec.status).to.equal("DITOLAK_REKTOR")
    expect(rec.reason).to.equal("Data SKP belum lengkap di lampiran")
    await submit(input({ npm: "2317051003", skpiId: "002/UN26.17/SKPI/2026" }))
  })

  it("7. perubahan diajukan admin, disetujui dekan lewat PerbaruiSKPI", async () => {
    await activate(input())
    const before = await client.getRecord("2317051001")
    await loginAs("admin.fmipa@unila.ac.id")
    await client.createDraft({ type: "PERUBAHAN", npm: "2317051001", data: data(input({ totalSKP: 230 })) })
    let rec = await client.getRecord("2317051001")
    expect(rec.status).to.equal("AKTIF")
    expect(rec.pendingDraft?.type).to.equal("PERUBAHAN")
    await expectApiError(client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" }), 409)
    await loginAs("dekan.fmipa@unila.ac.id")
    await client.approveDraft(rec.pendingDraft!.id)
    rec = await client.getRecord("2317051001")
    expect(rec.totalSKP).to.equal(230)
    expect(rec.predicate).to.equal("Unggul")
    expect(rec.pendingDraft).to.equal(null)
    expect(rec.issuedTimestamp).to.equal(before.issuedTimestamp)
    const last = rec.history[rec.history.length - 1]
    expect(last.action).to.equal("PerbaruiSKPI")
    expect(last.changes).to.deep.equal([{ field: "totalSKP", from: "180", to: "230" }])
  })

  it("8. pencabutan lalu catat ulang", async () => {
    await activate(input())
    await loginAs("admin.fmipa@unila.ac.id")
    const d = await client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" })
    await loginAs("dekan.fmipa@unila.ac.id")
    await client.approveDraft(d.id)
    const rec = await client.getRecord("2317051001")
    expect(rec.status).to.equal("DICABUT")
    expect(rec.history[rec.history.length - 1].action).to.equal("CabutSKPI")
    const again = await submit(input())
    expect(again.status).to.equal("MENUNGGU_DEKAN")
  })

  it("9. nomor SKPI yang dipakai NPM lain ditolak", async () => {
    await activate(input())
    await loginAs("admin.fmipa@unila.ac.id")
    await expectApiError(client.createDraft({ type: "PENCATATAN", npm: "2317051002", data: data(input({ npm: "2317051002" })) }), 409)
  })

  it("10. verifikasi publik hanya memberi data publik", async () => {
    await activate(input())
    await client.logout()
    const ok = await client.verify("2317051001")
    expect(ok.status).to.equal("TERDAFTAR")
    expect(ok.data).to.not.have.property("reason")
    expect(ok.data).to.not.have.property("revocationReason")
    expect(ok.data).to.not.have.property("dekanId")
    expect(ok.data?.issuer).to.equal("Dekan Fakultas Matematika dan Ilmu Pengetahuan Alam")
    expect(ok.rektorName).to.be.ok

    const p = input({ npm: "2317051002", skpiId: "002/UN26.17/SKPI/2026" })
    const d = await submit(p)
    await client.logout()
    expect(await client.verify(p.npm)).to.deep.equal({ status: "TIDAK_TERDAFTAR", data: null, rektorName: null, dekanName: null })
    await loginAs("dekan.fmipa@unila.ac.id")
    await client.approveDraft(d.id)
    await client.logout()
    expect(await client.verify(p.npm)).to.deep.equal({ status: "BELUM_SAH", data: null, rektorName: null, dekanName: null })

    await loginAs("admin.fmipa@unila.ac.id")
    const c = await client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" })
    await loginAs("dekan.fmipa@unila.ac.id")
    await client.approveDraft(c.id)
    await client.logout()
    const revoked = await client.verify("2317051001")
    expect(revoked.status).to.equal("DICABUT")
    expect(JSON.stringify(revoked)).to.not.include("diterbitkan ulang")
    expect(await client.verify("2317059999")).to.deep.equal({ status: "TIDAK_TERDAFTAR", data: null, rektorName: null, dekanName: null })
    await expectApiError(client.verify("12"), 400)
  })

  it("11. pencarian nama dibatasi 10 hasil", async () => {
    for (let i = 0; i < 12; i++) {
      const n = String(i + 1).padStart(3, "0")
      await activate(input({ npm: `2317051${n}`, name: "Budi Santoso", skpiId: `${n}/UN26.17/SKPI/2026` }))
    }
    await submit(input({ npm: "2317052001", name: "Budi Draft", skpiId: "500/UN26.17/SKPI/2026" }))
    await client.logout()
    const res = await client.searchPublic("  budi   SANTOSO ")
    expect(res.candidates).to.have.length(10)
    expect(res.truncated).to.equal(true)
    expect(res.candidates[0]).to.deep.include({ name: "Budi Santoso", facultyCode: "FMIPA" })
    expect((await client.searchPublic("budi draft")).candidates).to.have.length(0)
    await expectApiError(client.searchPublic("bu"), 400)
  })

  it("12. batch melaporkan galat per baris", async () => {
    await loginAs("admin.fmipa@unila.ac.id")
    const res = await client.createDrafts([input(), input({ skpiId: "002/UN26.17/SKPI/2026" })])
    expect(res.created).to.have.length(1)
    expect(res.errors).to.have.length(1)
    expect(res.errors[0]).to.deep.include({ index: 1, npm: "2317051001" })
  })

  it("draft yang ditolak Dekan tidak memblokir draft baru", async () => {
    await activate(input())
    await loginAs("admin.fmipa@unila.ac.id")
    const d = await client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" })
    await loginAs("dekan.fmipa@unila.ac.id")
    await client.rejectDraft(d.id, "Belum ada surat keputusan pencabutan")
    await loginAs("admin.fmipa@unila.ac.id")
    const again = await client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Sudah ada surat keputusan pencabutan" })
    const rec = await client.getRecord("2317051001")
    expect(rec.pendingDraft?.id).to.equal(again.id)
    expect(rec.pendingDraft?.status).to.equal("MENUNGGU_DEKAN")
  })

  it("draft ditolak yang digantikan draft baru tidak menyandera status maupun nomor SKPI", async () => {
    const d1 = await submit(input({ skpiId: "777/UN26.17/SKPI/2026" }))
    await loginAs("dekan.fmipa@unila.ac.id")
    await client.rejectDraft(d1.id, "Nomor SKPI tidak sesuai dokumen")
    const d2 = await submit(input({ skpiId: "778/UN26.17/SKPI/2026" }))
    await loginAs("dekan.fmipa@unila.ac.id")
    await client.approveDraft(d2.id)
    const rec = await client.getRecord("2317051001")
    expect(rec.status).to.equal("MENUNGGU_REKTOR")
    expect(rec.skpiId).to.equal("778/UN26.17/SKPI/2026")
    expect(rec.pendingDraft).to.equal(null)
    await loginAs("rektor@unila.ac.id")
    expect((await client.listQueue()).map((q) => q.record?.npm)).to.include("2317051001")
    await submit(input({ npm: "2317051002", skpiId: "777/UN26.17/SKPI/2026" }))
  })

  it("alasan berisi karakter kontrol ditolak", async () => {
    const d = await submit(input())
    await loginAs("dekan.fmipa@unila.ac.id")
    await expectApiError(client.rejectDraft(d.id, "Baris satu\nbaris dua alasan"), 400)
  })

  it("lingkup daftar mengikuti fakultas; filter status dan pencarian; aktivitas", async () => {
    await activate(input())
    await submit(input({ npm: "2317051002", name: "Rizky Maulana", skpiId: "002/UN26.17/SKPI/2026" }))
    await loginAs("admin.ft@unila.ac.id")
    expect(await client.listRecords()).to.have.length(0)
    await loginAs("rektor@unila.ac.id")
    expect((await client.listRecords()).map((r) => r.npm)).to.deep.equal(["2317051002", "2317051001"])
    expect((await client.listRecords({ status: "AKTIF" })).map((r) => r.npm)).to.deep.equal(["2317051001"])
    expect((await client.listRecords({ status: "PENDING" })).map((r) => r.npm)).to.deep.equal(["2317051002"])
    expect((await client.listRecords({ q: "rizky" })).map((r) => r.npm)).to.deep.equal(["2317051002"])
    const act = await client.activity(3)
    expect(act.map((a) => a.action)).to.deep.equal(["DIAJUKAN", "SahkanRektor", "SahkanDekan"])
    expect(act[0]).to.deep.include({ npm: "2317051002", name: "Rizky Maulana", kind: "offchain", txId: null })
  })
})
