import { expect } from "chai"
import type { SkpiInput } from "../../src/domain/skpi.js"
import { expectApiError, startContract } from "../helpers/contract.js"

const nth = (n: number): SkpiInput => ({
  npm: `231705${String(1000 + n)}`,
  name: `Lulusan ${n}`,
  skpiId: `${String(n).padStart(3, "0")}/UN26.17/SKPI/2026`,
  programStudy: "S1 Ilmu Komputer",
  totalSKP: 180,
})
const data = ({ npm: _n, ...rest }: SkpiInput) => rest

async function setup() {
  const c = await startContract()
  /** Draft pencatatan FMIPA ke-n, dibuat oleh admin. */
  async function draft(n: number) {
    await c.loginAs("admin.fmipa@unila.ac.id")
    const i = nth(n)
    return c.client.createDraft({ type: "PENCATATAN", npm: i.npm, data: data(i) })
  }
  async function drafts(count: number) {
    const out = []
    for (let n = 1; n <= count; n++) out.push(await draft(n))
    return out
  }
  const status = async (id: string) => (await c.pool.query("SELECT status FROM drafts WHERE id = $1", [id])).rows[0].status as string
  const txRows = async () => (await c.pool.query("SELECT status, fn FROM ledger_tx ORDER BY created_at, tx_id")).rows as Array<{ status: string; fn: string }>
  return { ...c, draft, drafts, status, txRows }
}

describe("pengesahan massal: banyak SKPI dalam satu blok", () => {
  describe("dekan", () => {
    it("12 draft disahkan bersamaan → SATU blok berisi 12 transaksi; proyeksi, draft, peristiwa, dan ledger_tx tercatat", async () => {
      const t = await setup()
      const ds = await t.drafts(12)
      await t.loginAs("dekan.fmipa@unila.ac.id")
      const before = await t.ledger.chainHeight()
      const out = await t.client.approveDraftsBatch(ds.map((d) => d.id))

      expect(out).to.have.length(12)
      expect(out.map((r) => r.key)).to.deep.equal(ds.map((d) => d.id))
      for (const r of out) {
        expect(r.ok).to.equal(true)
        if (r.ok) expect(r.txId).to.match(/^[0-9a-f]{64}$/)
      }
      expect(t.ledger.blockSizes).to.deep.equal([12])
      expect(await t.ledger.chainHeight()).to.equal(before + 1)
      for (const d of ds) expect(await t.status(d.id)).to.equal("DISETUJUI")
      expect((await t.pool.query("SELECT count(*)::int AS n FROM ledger_assets WHERE status = 'MENUNGGU_REKTOR'")).rows[0].n).to.equal(12)
      expect((await t.txRows()).every((r) => r.status === "COMMITTED" && r.fn === "SahkanDekan")).to.equal(true)
      const ev = (await t.pool.query("SELECT actor, tx_id AS \"txId\" FROM events WHERE kind = 'ledger' ORDER BY id")).rows
      expect(ev).to.have.length(12)
      expect(ev.every((e) => e.actor === "dekan-fmipa@UnilaMSP")).to.equal(true)
      const okIds = out.map((r) => (r.ok ? r.txId : ""))
      expect(ev.map((e) => e.txId).sort()).to.deep.equal([...okIds].sort())
    })

    it("100 draft (batas satu blok) disahkan bersamaan → SATU blok berisi 100 transaksi", async () => {
      const t = await setup()
      const ds = await t.drafts(100)
      await t.loginAs("dekan.fmipa@unila.ac.id")
      const before = await t.ledger.chainHeight()
      const out = await t.client.approveDraftsBatch(ds.map((d) => d.id))
      expect(out).to.have.length(100)
      expect(out.every((r) => r.ok)).to.equal(true)
      expect(t.ledger.blockSizes).to.deep.equal([100])
      expect(await t.ledger.chainHeight()).to.equal(before + 1)
      expect((await t.pool.query("SELECT count(*)::int AS n FROM drafts WHERE status = 'DISETUJUI'")).rows[0].n).to.equal(100)
      expect((await t.txRows()).filter((r) => r.status === "COMMITTED")).to.have.length(100)
    }).timeout(60000)

    it("item bermasalah (draft tidak ada, fakultas lain, sudah disahkan) hanya gagal sendiri dan tidak dikirim ke ledger", async () => {
      const t = await setup()
      const [a, b, c] = await t.drafts(3)
      await t.loginAs("dekan.fmipa@unila.ac.id")
      await t.client.approveDraft(c.id) // sudah disahkan sebelumnya
      t.ledger.blockSizes.length = 0
      const calls = t.ledger.submitCalls
      const out = await t.client.approveDraftsBatch([a.id, "999999", c.id, b.id])

      expect(out.map((r) => r.ok)).to.deep.equal([true, false, false, true])
      const [, missing, done] = out
      if (!missing.ok) expect(missing).to.include({ status: 404, code: "NOT_FOUND" })
      if (!done.ok) expect(done).to.include({ status: 409, code: "CONFLICT" })
      expect(t.ledger.submitCalls - calls).to.equal(2)
      expect(t.ledger.blockSizes).to.deep.equal([2])
    })

    it("draft fakultas lain → 403 per item; draft itu tidak berubah", async () => {
      const t = await setup()
      const [a] = await t.drafts(1)
      await t.loginAs("dekan.ft@unila.ac.id")
      const out = await t.client.approveDraftsBatch([a.id])
      expect(out[0].ok).to.equal(false)
      if (!out[0].ok) expect(out[0]).to.include({ status: 403, code: "FORBIDDEN" })
      expect(await t.status(a.id)).to.equal("MENUNGGU_DEKAN")
      expect(t.ledger.submitCalls).to.equal(0)
    })

    it("ledger menolak satu item saat endorse: item itu kembali ke MENUNGGU_DEKAN, yang lain tetap satu blok", async () => {
      const t = await setup()
      const [a, b, c] = await t.drafts(3)
      t.ledger.index.set(nth(2).skpiId, "2999999999") // nomor SKPI draft ke-2 sudah dipakai NPM lain di ledger
      await t.loginAs("dekan.fmipa@unila.ac.id")
      const out = await t.client.approveDraftsBatch([a.id, b.id, c.id])

      expect(out.map((r) => r.ok)).to.deep.equal([true, false, true])
      if (!out[1].ok) expect(out[1]).to.include({ status: 409, code: "CONFLICT" })
      expect(await t.status(b.id)).to.equal("MENUNGGU_DEKAN")
      expect(await t.status(a.id)).to.equal("DISETUJUI")
      expect(await t.status(c.id)).to.equal("DISETUJUI")
      expect(t.ledger.blockSizes).to.deep.equal([2])
      expect((await t.txRows()).filter((r) => r.status === "FAILED")).to.have.length(0)
    })

    it("status commit belum pasti untuk satu item: draft tetap MENUNGGU_KONFIRMASI, ledger_tx PENDING, item lain berhasil", async () => {
      const t = await setup()
      const [a, b, c] = await t.drafts(3)
      t.ledger.failBatchItemWith(1, "COMMIT_UNKNOWN", { applied: true })
      await t.loginAs("dekan.fmipa@unila.ac.id")
      const out = await t.client.approveDraftsBatch([a.id, b.id, c.id])

      expect(out.map((r) => r.ok)).to.deep.equal([true, false, true])
      if (!out[1].ok) expect(out[1]).to.include({ status: 503, code: "COMMIT_UNKNOWN" })
      expect(await t.status(b.id)).to.equal("MENUNGGU_KONFIRMASI")
      expect((await t.txRows()).filter((r) => r.status === "PENDING")).to.have.length(1)
      // Dua kali menyetujui draft yang masih menunggu konfirmasi ditolak (tidak boleh ganda).
      const again = await t.client.approveDraftsBatch([b.id])
      expect(again[0].ok).to.equal(false)
      if (!again[0].ok) expect(again[0].status).to.equal(409)
    })

    it("ledger mati: semua item 503, semua draft dikembalikan, tidak ada transaksi tercatat", async () => {
      const t = await setup()
      const ds = await t.drafts(3)
      t.ledger.setOnline(false)
      await t.loginAs("dekan.fmipa@unila.ac.id")
      const out = await t.client.approveDraftsBatch(ds.map((d) => d.id))
      expect(out.every((r) => !r.ok && r.status === 503 && r.code === "UNAVAILABLE")).to.equal(true)
      for (const d of ds) expect(await t.status(d.id)).to.equal("MENUNGGU_DEKAN")
      expect(await t.txRows()).to.have.length(0)
    })

    it("validasi permintaan: kosong, lebih dari 100, ganda, bukan teks → 400; peran salah → 403; tanpa login → 401", async () => {
      const t = await setup()
      const [a] = await t.drafts(1)
      await t.loginAs("dekan.fmipa@unila.ac.id")
      await expectApiError(t.client.approveDraftsBatch([]), 400)
      await expectApiError(t.client.approveDraftsBatch(Array.from({ length: 101 }, (_, i) => String(i + 1))), 400)
      await expectApiError(t.client.approveDraftsBatch([a.id, a.id]), 400)
      const raw = (body: unknown) => t.fetchImpl(`${t.base}/approvals/dekan/batch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      expect((await raw({ ids: [1, 2] })).status).to.equal(400)
      expect((await raw({})).status).to.equal(400)
      await t.loginAs("rektor@unila.ac.id")
      await expectApiError(t.client.approveDraftsBatch([a.id]), 403)
      await t.loginAs("admin.fmipa@unila.ac.id")
      await expectApiError(t.client.approveDraftsBatch([a.id]), 403)
      await t.client.logout()
      await expectApiError(t.client.approveDraftsBatch([a.id]), 401)
      expect(t.ledger.submitCalls).to.equal(0)
    })
  })

  describe("rektor", () => {
    async function pendingRektor(count: number) {
      const t = await setup()
      const ds = await t.drafts(count)
      await t.loginAs("dekan.fmipa@unila.ac.id")
      await t.client.approveDraftsBatch(ds.map((d) => d.id))
      await t.loginAs("rektor@unila.ac.id")
      t.ledger.blockSizes.length = 0
      return { t, npms: ds.map((_, i) => nth(i + 1).npm) }
    }

    it("12 SKPI disahkan Rektor bersamaan → SATU blok berisi 12 transaksi; semua AKTIF", async () => {
      const { t, npms } = await pendingRektor(12)
      const out = await t.client.rektorApproveBatch(npms)
      expect(out.map((r) => r.key)).to.deep.equal(npms)
      expect(out.every((r) => r.ok)).to.equal(true)
      expect(t.ledger.blockSizes).to.deep.equal([12])
      expect((await t.pool.query("SELECT count(*)::int AS n FROM ledger_assets WHERE status = 'AKTIF'")).rows[0].n).to.equal(12)
      expect((await t.txRows()).filter((r) => r.fn === "SahkanRektor" && r.status === "COMMITTED")).to.have.length(12)
    })

    it("NPM yang tidak menunggu Rektor atau punya transaksi tertunda gagal sendiri; yang lain tetap satu blok", async () => {
      const { t, npms } = await pendingRektor(3)
      const out = await t.client.rektorApproveBatch([npms[0], "2317059999", "abc", npms[2]])
      expect(out.map((r) => r.ok)).to.deep.equal([true, false, false, true])
      if (!out[1].ok) expect(out[1]).to.include({ status: 404, code: "NOT_FOUND" })
      if (!out[2].ok) expect(out[2]).to.include({ status: 400, code: "VALIDATION" })
      expect(t.ledger.blockSizes).to.deep.equal([2])
    })

    it("peran dekan ditolak (403) dan daftar ganda ditolak (400)", async () => {
      const { t, npms } = await pendingRektor(2)
      await expectApiError(t.client.rektorApproveBatch([npms[0], npms[0]]), 400)
      await expectApiError(t.client.rektorApproveBatch([]), 400)
      await t.loginAs("dekan.fmipa@unila.ac.id")
      await expectApiError(t.client.rektorApproveBatch(npms), 403)
    })
  })
})
