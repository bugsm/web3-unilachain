import { expect } from "chai"
import sinon from "sinon"
import { assets } from "../../src/db/repos/assets.js"
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

async function setup() {
  const c = await startContract()
  async function submit(i = input()) {
    await c.loginAs("admin.fmipa@unila.ac.id")
    return c.client.createDraft({ type: "PENCATATAN", npm: i.npm, data: data(i) })
  }
  async function activate(i = input()) {
    const d = await submit(i)
    await c.loginAs("dekan.fmipa@unila.ac.id")
    await c.client.approveDraft(d.id)
    await c.loginAs("rektor@unila.ac.id")
    await c.client.rektorApprove(i.npm)
  }
  const draftStatus = async (id: string) => (await c.pool.query("SELECT status FROM drafts WHERE id = $1", [id])).rows[0].status
  const ledgerEvents = async (npm: string) =>
    (await c.pool.query("SELECT action, actor, tx_id AS \"txId\", note, changes FROM events WHERE npm = $1 AND kind = 'ledger' ORDER BY id", [npm])).rows
  return { ...c, submit, activate, draftStatus, ledgerEvents }
}

describe("persetujuan dekan dan rektor", () => {
  it("dekan menyetujui → SahkanDekan dengan identitas dekan-fmipa; proyeksi, draft, dan peristiwa diperbarui", async () => {
    const t = await setup()
    const d = await t.submit()
    await t.loginAs("dekan.fmipa@unila.ac.id")
    const { txId } = await t.client.approveDraft(d.id)
    expect(txId).to.match(/^[0-9a-f]{64}$/)
    expect(t.ledger.state.get("2317051001")?.status).to.equal("MENUNGGU_REKTOR")
    expect(await t.draftStatus(d.id)).to.equal("DISETUJUI")
    expect(await t.ledgerEvents("2317051001")).to.deep.equal([{ action: "SahkanDekan", actor: "dekan-fmipa@UnilaMSP", txId, note: null, changes: [] }])
    const proj = (await t.pool.query("SELECT status FROM ledger_assets WHERE npm = '2317051001'")).rows[0]
    expect(proj.status).to.equal("MENUNGGU_REKTOR")
    const tx = (await t.pool.query("SELECT status, fn, identity FROM ledger_tx WHERE tx_id = $1", [txId])).rows[0]
    expect(tx).to.deep.equal({ status: "COMMITTED", fn: "SahkanDekan", identity: "dekan-fmipa" })
  })

  it("dekan fakultas lain → 403 tanpa memanggil ledger; admin tidak boleh menyetujui", async () => {
    const t = await setup()
    const d = await t.submit()
    await t.loginAs("dekan.ft@unila.ac.id")
    await expectApiError(t.client.approveDraft(d.id), 403)
    await expectApiError(t.client.rejectDraft(d.id, "Nomor SKPI tidak sesuai dokumen"), 403)
    await t.loginAs("admin.fmipa@unila.ac.id")
    await expectApiError(t.client.approveDraft(d.id), 403)
    expect(t.ledger.submitCalls).to.equal(0)
    expect(await t.draftStatus(d.id)).to.equal("MENUNGGU_DEKAN")
  })

  it("penolakan dekan hanya off-chain, alasan wajib", async () => {
    const t = await setup()
    const d = await t.submit()
    await t.loginAs("dekan.fmipa@unila.ac.id")
    await expectApiError(t.client.rejectDraft(d.id, "pendek"), 400)
    const r = await t.client.rejectDraft(d.id, "Nomor SKPI tidak sesuai dokumen")
    expect(r).to.deep.include({ status: "DITOLAK_DEKAN", rejectReason: "Nomor SKPI tidak sesuai dokumen" })
    expect(t.ledger.submitCalls).to.equal(0)
    await expectApiError(t.client.approveDraft(d.id), 409)
  })

  it("rektor mengesahkan atau menolak; nomor SKPI dilepas setelah ditolak", async () => {
    const t = await setup()
    await t.activate()
    expect(t.ledger.state.get("2317051001")?.status).to.equal("AKTIF")
    const other = input({ npm: "2317051002", skpiId: "002/UN26.17/SKPI/2026" })
    const d = await t.submit(other)
    await t.loginAs("dekan.fmipa@unila.ac.id")
    await t.client.approveDraft(d.id)
    await t.loginAs("rektor@unila.ac.id")
    await expectApiError(t.client.rektorReject(other.npm, "x"), 400)
    await t.client.rektorReject(other.npm, "Data SKP belum lengkap di lampiran")
    expect(t.ledger.state.get(other.npm)?.status).to.equal("DITOLAK_REKTOR")
    await expectApiError(t.client.rektorApprove(other.npm), 409)
    await expectApiError(t.client.rektorApprove("2317059999"), 404)
    await t.submit(input({ npm: "2317051003", skpiId: "002/UN26.17/SKPI/2026" }))
  })

  it("perubahan lewat PerbaruiSKPI mencatat field yang berubah", async () => {
    const t = await setup()
    await t.activate()
    await t.loginAs("admin.fmipa@unila.ac.id")
    const p = await t.client.createDraft({ type: "PERUBAHAN", npm: "2317051001", data: data(input({ totalSKP: 230 })) })
    await t.loginAs("dekan.fmipa@unila.ac.id")
    await t.client.approveDraft(p.id)
    expect(t.ledger.state.get("2317051001")).to.deep.include({ totalSKP: 230, predicate: "Unggul" })
    const last = (await t.ledgerEvents("2317051001")).at(-1)
    expect(last.action).to.equal("PerbaruiSKPI")
    expect(last.changes).to.deep.equal([{ field: "totalSKP", from: "180", to: "230" }])
  })

  it("pencabutan lewat CabutSKPI lalu boleh dicatat ulang", async () => {
    const t = await setup()
    await t.activate()
    await t.loginAs("admin.fmipa@unila.ac.id")
    const c = await t.client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" })
    await t.loginAs("dekan.fmipa@unila.ac.id")
    await t.client.approveDraft(c.id)
    expect(t.ledger.state.get("2317051001")?.status).to.equal("DICABUT")
    expect((await t.ledgerEvents("2317051001")).at(-1)).to.deep.include({ action: "CabutSKPI", note: "Dokumen diterbitkan ulang" })
    const again = await t.submit()
    expect(again.status).to.equal("MENUNGGU_DEKAN")
  })

  it("penolakan chaincode (mis. nomor dipakai di ledger) → status HTTP sesuai, draft kembali menunggu", async () => {
    const t = await setup()
    const d = await t.submit()
    t.ledger.failNextSubmitWith("REJECTED", { message: "Nomor SKPI 001/UN26.17/SKPI/2026 sudah dipakai" })
    await t.loginAs("dekan.fmipa@unila.ac.id")
    const e = await expectApiError(t.client.approveDraft(d.id), 409)
    expect(e.message).to.equal("Nomor SKPI 001/UN26.17/SKPI/2026 sudah dipakai.")
    expect(await t.draftStatus(d.id)).to.equal("MENUNGGU_DEKAN")
  })

  it("peer mati → 503 dan draft tetap bisa disetujui setelah pulih", async () => {
    const t = await setup()
    const d = await t.submit()
    await t.loginAs("dekan.fmipa@unila.ac.id")
    t.ledger.setOnline(false)
    await expectApiError(t.client.approveDraft(d.id), 503)
    expect(await t.draftStatus(d.id)).to.equal("MENUNGGU_DEKAN")
    t.ledger.setOnline(true)
    await t.client.approveDraft(d.id)
    expect(await t.draftStatus(d.id)).to.equal("DISETUJUI")
  })

  it("commit belum pasti → 503, draft tidak DISETUJUI dan tidak bisa disetujui ulang", async () => {
    const t = await setup()
    const d = await t.submit()
    await t.loginAs("dekan.fmipa@unila.ac.id")
    t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied: true })
    const e = await expectApiError(t.client.approveDraft(d.id), 503)
    expect(e.code).to.equal("COMMIT_UNKNOWN")
    expect(await t.draftStatus(d.id)).to.equal("MENUNGGU_KONFIRMASI")
    const pending = (await t.pool.query("SELECT status, draft_id::text AS \"draftId\" FROM ledger_tx")).rows
    expect(pending).to.deep.equal([{ status: "PENDING", draftId: d.id }])
    const again = await expectApiError(t.client.approveDraft(d.id), 409)
    expect(again.message).to.equal("Transaksi sebelumnya masih menunggu konfirmasi ledger.")
    expect(t.ledger.submitCalls).to.equal(1)
  })

  it("commit sukses tetapi penulisan DB gagal → tetap menunggu rekonsiliasi, bukan dikembalikan", async () => {
    const t = await setup()
    const d = await t.submit()
    await t.loginAs("dekan.fmipa@unila.ac.id")
    const stub = sinon.stub(assets, "upsert").rejects(new Error("koneksi DB putus"))
    try {
      await expectApiError(t.client.approveDraft(d.id), 500)
    } finally {
      stub.restore()
    }
    expect(t.ledger.state.get("2317051001")?.status).to.equal("MENUNGGU_REKTOR")
    expect(await t.draftStatus(d.id)).to.equal("MENUNGGU_KONFIRMASI")
    expect((await t.pool.query("SELECT status FROM ledger_tx")).rows).to.deep.equal([{ status: "PENDING" }])
  })

  it("rektor: commit belum pasti mengunci NPM sampai rekonsiliasi", async () => {
    const t = await setup()
    const d = await t.submit()
    await t.loginAs("dekan.fmipa@unila.ac.id")
    await t.client.approveDraft(d.id)
    await t.loginAs("rektor@unila.ac.id")
    t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied: false })
    await expectApiError(t.client.rektorApprove("2317051001"), 503)
    const again = await expectApiError(t.client.rektorApprove("2317051001"), 409)
    expect(again.message).to.equal("Transaksi sebelumnya masih menunggu konfirmasi ledger.")
  })
})
