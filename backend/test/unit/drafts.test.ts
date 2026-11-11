import { expect } from "chai"
import type { SkpiInput } from "../../src/domain/skpi.js"
import { assets, type LedgerAsset } from "../../src/db/repos/assets.js"
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

/** Aset AKTIF di proyeksi (keadaan setelah SahkanRektor). */
const active = (npm = "2317051001", skpiId = "001/UN26.17/SKPI/2026"): LedgerAsset => ({
  npm, name: "Nabila Azzahra", skpiId, programStudy: "S1 Ilmu Komputer", totalSKP: 180, predicate: "Sangat Baik",
  facultyCode: "FMIPA", unitCode: "UN26.17", issuer: "Dekan Fakultas Matematika dan Ilmu Pengetahuan Alam",
  issuedTimestamp: "2026-10-13T11:00:00.000Z", status: "AKTIF", dekanId: "x", rektorId: "y",
  rektorTimestamp: "2026-10-14T03:00:00.000Z", updatedTimestamp: "", revocationReason: "",
})

describe("draft admin", () => {
  it("admin mengajukan draft pencatatan fakultasnya (body datar, {draft})", async () => {
    const { client, loginAs } = await startContract()
    await loginAs("admin.fmipa@unila.ac.id")
    const d = await client.createDraft({ type: "PENCATATAN", npm: "2317 0510 01", data: data(input({ name: "  Nabila   Azzahra " })) })
    expect(d).to.deep.include({ type: "PENCATATAN", status: "MENUNGGU_DEKAN", npm: "2317051001", facultyCode: "FMIPA", reason: null, rejectReason: null, createdBy: "admin.fmipa (off-chain)" })
    expect(d.data).to.deep.equal({ name: "Nabila Azzahra", skpiId: "001/UN26.17/SKPI/2026", programStudy: "S1 Ilmu Komputer", totalSKP: 180 })
    expect(d.id).to.be.a("string")
  })

  it("NPM fakultas lain → 403, data tidak valid → 400, tanpa baris draft", async () => {
    const { client, loginAs, pool } = await startContract()
    await loginAs("admin.ft@unila.ac.id")
    await expectApiError(client.createDraft({ type: "PENCATATAN", npm: "2317051001", data: data(input()) }), 403)
    await loginAs("admin.fmipa@unila.ac.id")
    await expectApiError(client.createDraft({ type: "PENCATATAN", npm: "2317051002", data: data(input({ npm: "2317051002", totalSKP: 20 })) }), 400)
    await expectApiError(client.createDraft({ type: "PENCATATAN", npm: "123", data: data(input()) }), 400)
    expect((await pool.query("SELECT count(*)::int AS n FROM drafts")).rows[0].n).to.equal(0)
  })

  it("dekan dan rektor tidak boleh mengajukan draft; tanpa sesi 401", async () => {
    const { client, loginAs } = await startContract()
    await expectApiError(client.createDraft({ type: "PENCATATAN", npm: "2317051001", data: data(input()) }), 401)
    await loginAs("dekan.fmipa@unila.ac.id")
    await expectApiError(client.createDraft({ type: "PENCATATAN", npm: "2317051001", data: data(input()) }), 403)
  })

  it("satu draft menunggu per NPM; nomor SKPI unik terhadap draft lain dan aset", async () => {
    const { client, loginAs, pool } = await startContract()
    await loginAs("admin.fmipa@unila.ac.id")
    await client.createDraft({ type: "PENCATATAN", npm: "2317051001", data: data(input()) })
    await expectApiError(client.createDraft({ type: "PENCATATAN", npm: "2317051001", data: data(input({ skpiId: "009/UN26.17/SKPI/2026" })) }), 409)
    await expectApiError(client.createDraft({ type: "PENCATATAN", npm: "2317051002", data: data(input({ npm: "2317051002" })) }), 409)
    await assets.upsert(pool, active("2317051005", "005/UN26.17/SKPI/2026"))
    await expectApiError(client.createDraft({ type: "PENCATATAN", npm: "2317051006", data: data(input({ npm: "2317051006", skpiId: "005/UN26.17/SKPI/2026" })) }), 409)
    await expectApiError(client.createDraft({ type: "PENCATATAN", npm: "2317051005", data: data(input({ npm: "2317051005", skpiId: "006/UN26.17/SKPI/2026" })) }), 409)
  })

  it("perubahan dan pencabutan hanya untuk SKPI AKTIF; alasan wajib dan tanpa karakter kontrol", async () => {
    const { client, loginAs, pool } = await startContract()
    await loginAs("admin.fmipa@unila.ac.id")
    await expectApiError(client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" }), 404)
    await assets.upsert(pool, active())
    await expectApiError(client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "pendek" }), 400)
    await expectApiError(client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen\u0007 diterbitkan ulang" }), 400)
    const p = await client.createDraft({ type: "PERUBAHAN", npm: "2317051001", data: data(input({ totalSKP: 230 })) })
    expect(p).to.deep.include({ type: "PERUBAHAN", status: "MENUNGGU_DEKAN" })
    await expectApiError(client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" }), 409)
    await expectApiError(client.createDraft({ type: "PENCATATAN", npm: "2317051001", data: data(input()) }), 409)
  })

  it("draft ditolak dapat diperbaiki (PUT) dan draft baru menggantikannya", async () => {
    const { client, loginAs, pool } = await startContract()
    await loginAs("admin.fmipa@unila.ac.id")
    const d = await client.createDraft({ type: "PENCATATAN", npm: "2317051001", data: data(input()) })
    await expectApiError(client.updateDraft(d.id, data(input({ skpiId: "002/UN26.17/SKPI/2026" }))), 409)
    await pool.query("UPDATE drafts SET status = 'DITOLAK_DEKAN', reject_reason = 'Nomor tidak sesuai' WHERE id = $1", [d.id])
    const fixed = await client.updateDraft(d.id, data(input({ skpiId: "002/UN26.17/SKPI/2026" })))
    expect(fixed).to.deep.include({ status: "MENUNGGU_DEKAN", rejectReason: null })
    expect(fixed.data?.skpiId).to.equal("002/UN26.17/SKPI/2026")

    await pool.query("UPDATE drafts SET status = 'DITOLAK_DEKAN' WHERE id = $1", [d.id])
    const again = await client.createDraft({ type: "PENCATATAN", npm: "2317051001", data: data(input({ skpiId: "002/UN26.17/SKPI/2026" })) })
    expect(again.id).to.not.equal(d.id)
    expect((await pool.query("SELECT status FROM drafts WHERE id = $1", [d.id])).rows[0].status).to.equal("DIGANTIKAN")
    await loginAs("admin.ft@unila.ac.id")
    await expectApiError(client.updateDraft(again.id, data(input())), 403)
  })

  it("batch melaporkan galat per baris dan mencatat peristiwa DIAJUKAN", async () => {
    const { client, loginAs, pool } = await startContract()
    await loginAs("admin.fmipa@unila.ac.id")
    const res = await client.createDrafts([input(), input({ skpiId: "002/UN26.17/SKPI/2026" }), input({ npm: "2317051009", totalSKP: 3, skpiId: "009/UN26.17/SKPI/2026" })])
    expect(res.created).to.have.length(1)
    expect(res.errors.map((e) => [e.index, e.npm])).to.deep.equal([[1, "2317051001"], [2, "2317051009"]])
    const ev = await pool.query("SELECT action, kind, actor, note FROM events")
    expect(ev.rows).to.deep.equal([{ action: "DIAJUKAN", kind: "offchain", actor: "admin.fmipa (off-chain)", note: "Draft pencatatan" }])
  })
})
