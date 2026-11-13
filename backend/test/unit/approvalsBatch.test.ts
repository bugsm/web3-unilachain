import { expect } from "chai"
import type { SkpiInput } from "../../src/domain/skpi.js"
import { reconcileOnce } from "../../src/services/reconcile.js"
import { testConfig } from "../helpers/app.js"
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
    it("12 draft disahkan bersamaan → SATU transaksi, SATU blok berisi 12 SKPI; proyeksi, draft, peristiwa, dan ledger_tx tercatat", async () => {
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
      expect(t.ledger.blockSizes).to.deep.equal([1]) // satu transaksi
      expect(t.ledger.blockAssets).to.deep.equal([12]) // memuat 12 aset
      expect(new Set(out.map((r) => (r.ok ? r.txId : ""))).size).to.equal(1)
      expect((await t.pool.query("SELECT count(distinct tx_id)::int AS n, count(*)::int AS baris FROM ledger_tx")).rows[0]).to.deep.equal({ n: 1, baris: 12 })
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

    it("100 draft (batas satu blok) disahkan bersamaan → SATU transaksi, SATU blok berisi 100 SKPI", async () => {
      const t = await setup()
      const ds = await t.drafts(100)
      await t.loginAs("dekan.fmipa@unila.ac.id")
      const before = await t.ledger.chainHeight()
      const out = await t.client.approveDraftsBatch(ds.map((d) => d.id))
      expect(out).to.have.length(100)
      expect(out.every((r) => r.ok)).to.equal(true)
      expect(t.ledger.blockSizes).to.deep.equal([1])
      expect(t.ledger.blockAssets).to.deep.equal([100])
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
      t.ledger.blockAssets.length = 0
      const calls = t.ledger.submitCalls
      const out = await t.client.approveDraftsBatch([a.id, "999999", c.id, b.id])

      expect(out.map((r) => r.ok)).to.deep.equal([true, false, false, true])
      const [, missing, done] = out
      if (!missing.ok) expect(missing).to.include({ status: 404, code: "NOT_FOUND" })
      if (!done.ok) expect(done).to.include({ status: 409, code: "CONFLICT" })
      expect(t.ledger.submitCalls - calls).to.equal(1) // satu transaksi untuk dua draft yang lolos
      expect(t.ledger.blockAssets).to.deep.equal([2])
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

    it("chaincode menolak satu butir: butir itu kembali ke MENUNGGU_DEKAN, sisanya dikirim ulang dan tetap satu blok", async () => {
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
      expect(t.ledger.submitCalls).to.equal(2) // percobaan pertama ditolak (tanpa blok), percobaan kedua tanpa butir itu
      expect(t.ledger.blockSizes).to.deep.equal([1])
      expect(t.ledger.blockAssets).to.deep.equal([2])
      expect((await t.txRows()).filter((r) => r.status === "FAILED")).to.have.length(0)
    })

    it("status commit belum pasti: SEMUA draft tetap MENUNGGU_KONFIRMASI dan tiap SKPI punya baris ledger_tx PENDING dengan txId yang sama", async () => {
      const t = await setup()
      const ds = await t.drafts(3)
      t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied: true })
      await t.loginAs("dekan.fmipa@unila.ac.id")
      const out = await t.client.approveDraftsBatch(ds.map((d) => d.id))

      expect(out.every((r) => !r.ok && r.status === 503 && r.code === "COMMIT_UNKNOWN")).to.equal(true)
      for (const d of ds) expect(await t.status(d.id)).to.equal("MENUNGGU_KONFIRMASI")
      const rows = await t.txRows()
      expect(rows).to.have.length(3)
      expect(rows.every((r) => r.status === "PENDING")).to.equal(true)
      expect((await t.pool.query("SELECT count(distinct tx_id)::int AS n FROM ledger_tx")).rows[0].n).to.equal(1)
      // Draft yang masih menunggu konfirmasi tidak boleh disahkan ganda.
      const again = await t.client.approveDraftsBatch([ds[0].id])
      expect(again[0].ok).to.equal(false)
      if (!again[0].ok) expect(again[0].status).to.equal(409)
    })

    it("semua butir ditolak chaincode: semua gagal per item, tidak ada blok, semua draft dikembalikan, tanpa percobaan ulang", async () => {
      const t = await setup()
      const ds = await t.drafts(3)
      for (const n of [1, 2, 3]) t.ledger.index.set(nth(n).skpiId, "2999999999")
      await t.loginAs("dekan.fmipa@unila.ac.id")
      const out = await t.client.approveDraftsBatch(ds.map((d) => d.id))
      expect(out.every((r) => !r.ok && r.status === 409)).to.equal(true)
      for (const d of ds) expect(await t.status(d.id)).to.equal("MENUNGGU_DEKAN")
      expect(t.ledger.submitCalls).to.equal(1)
      expect(t.ledger.blockSizes).to.deep.equal([])
      expect(await t.txRows()).to.have.length(0)
    })

    it("penolakan tingkat transaksi (mis. konflik MVCC): semua item gagal dengan status yang sama dan semua draft dikembalikan", async () => {
      const t = await setup()
      const ds = await t.drafts(2)
      t.ledger.failNextSubmitWith("REJECTED", { message: "Transaksi tidak valid: MVCC_READ_CONFLICT" })
      await t.loginAs("dekan.fmipa@unila.ac.id")
      const out = await t.client.approveDraftsBatch(ds.map((d) => d.id))
      expect(out.every((r) => !r.ok && r.status === 409 && r.code === "CONFLICT")).to.equal(true)
      for (const d of ds) expect(await t.status(d.id)).to.equal("MENUNGGU_DEKAN")
    })

    it("draft perubahan ikut disahkan sebagai transaksi tunggal, sedangkan pencatatan baru tetap SATU transaksi batch", async () => {
      const t = await setup()
      const [lama] = await t.drafts(1)
      await t.loginAs("dekan.fmipa@unila.ac.id")
      await t.client.approveDraftsBatch([lama.id])
      await t.loginAs("rektor@unila.ac.id")
      await t.client.rektorApproveBatch([nth(1).npm])
      await t.loginAs("admin.fmipa@unila.ac.id")
      const ubah = await t.client.createDraft({ type: "PERUBAHAN", npm: nth(1).npm, data: { ...data(nth(1)), totalSKP: 230 } })
      const baru2 = await t.draft(2)
      const baru3 = await t.draft(3)
      t.ledger.blockSizes.length = 0
      t.ledger.blockAssets.length = 0
      await t.loginAs("dekan.fmipa@unila.ac.id")

      const out = await t.client.approveDraftsBatch([ubah.id, baru2.id, baru3.id])
      expect(out.map((r) => r.ok)).to.deep.equal([true, true, true])
      expect([...t.ledger.blockAssets].sort()).to.deep.equal([1, 2]) // satu perubahan tunggal + dua pencatatan dalam satu batch
      expect(t.ledger.state.get(nth(1).npm)?.totalSKP).to.equal(230)
      for (const d of [ubah, baru2, baru3]) expect(await t.status(d.id)).to.equal("DISETUJUI")
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
      t.ledger.blockAssets.length = 0
      return { t, npms: ds.map((_, i) => nth(i + 1).npm) }
    }

    it("12 SKPI disahkan Rektor bersamaan → SATU transaksi, SATU blok berisi 12 SKPI; semua AKTIF", async () => {
      const { t, npms } = await pendingRektor(12)
      const out = await t.client.rektorApproveBatch(npms)
      expect(out.map((r) => r.key)).to.deep.equal(npms)
      expect(out.every((r) => r.ok)).to.equal(true)
      expect(t.ledger.blockSizes).to.deep.equal([1])
      expect(t.ledger.blockAssets).to.deep.equal([12])
      expect((await t.pool.query("SELECT count(*)::int AS n FROM ledger_assets WHERE status = 'AKTIF'")).rows[0].n).to.equal(12)
      expect((await t.txRows()).filter((r) => r.fn === "SahkanRektor" && r.status === "COMMITTED")).to.have.length(12)
    })

    it("NPM yang tidak menunggu Rektor atau punya transaksi tertunda gagal sendiri; yang lain tetap satu blok", async () => {
      const { t, npms } = await pendingRektor(3)
      const out = await t.client.rektorApproveBatch([npms[0], "2317059999", "abc", npms[2]])
      expect(out.map((r) => r.ok)).to.deep.equal([true, false, false, true])
      if (!out[1].ok) expect(out[1]).to.include({ status: 404, code: "NOT_FOUND" })
      if (!out[2].ok) expect(out[2]).to.include({ status: 400, code: "VALIDATION" })
      expect(t.ledger.blockAssets).to.deep.equal([2])
    })

    it("peran dekan ditolak (403) dan daftar ganda ditolak (400)", async () => {
      const { t, npms } = await pendingRektor(2)
      await expectApiError(t.client.rektorApproveBatch([npms[0], npms[0]]), 400)
      await expectApiError(t.client.rektorApproveBatch([]), 400)
      await t.loginAs("dekan.fmipa@unila.ac.id")
      await expectApiError(t.client.rektorApproveBatch(npms), 403)
    })
  })

  describe("rekonsiliasi transaksi batch yang status commit-nya belum pasti", () => {
    async function unknown(applied: boolean, count = 3) {
      const t = await setup()
      const ds = await t.drafts(count)
      t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied })
      await t.loginAs("dekan.fmipa@unila.ac.id")
      await t.client.approveDraftsBatch(ds.map((d) => d.id))
      const ctx = { config: testConfig, pool: t.pool, ledger: t.ledger, now: () => new Date() }
      const later = { ...ctx, now: () => new Date(Date.now() + 3 * 60_000) }
      return { t, ds, ctx, later }
    }

    it("ternyata ter-commit: semua SKPI dicatat dari satu transaksi (draft DISETUJUI, proyeksi, peristiwa dengan txId yang sama)", async () => {
      const { t, ds, later } = await unknown(true)
      expect(await reconcileOnce(later)).to.deep.equal({ committed: 3, failed: 0, unknown: 0, released: 0 })
      for (const d of ds) expect(await t.status(d.id)).to.equal("DISETUJUI")
      expect((await t.txRows()).every((r) => r.status === "COMMITTED")).to.equal(true)
      const [txId] = [...t.ledger.txs.keys()]
      const ev = (await t.pool.query("SELECT action, tx_id FROM events WHERE kind = 'ledger'")).rows
      expect(ev).to.have.length(3)
      expect(ev.every((e) => e.action === "SahkanDekan" && e.tx_id === txId)).to.equal(true)
      expect((await t.pool.query("SELECT count(*)::int AS n FROM ledger_assets WHERE status = 'MENUNGGU_REKTOR'")).rows[0].n).to.equal(3)
    })

    it("ternyata tidak valid: semua baris gagal dan semua draft kembali menunggu Dekan", async () => {
      const { t, ds, later } = await unknown(false)
      expect(await reconcileOnce(later)).to.deep.include({ failed: 3, committed: 0 })
      for (const d of ds) expect(await t.status(d.id)).to.equal("MENUNGGU_DEKAN")
      expect((await t.txRows()).every((r) => r.status === "FAILED")).to.equal(true)
    })

    it("peer mati: tidak ada yang berubah (semua tetap menunggu)", async () => {
      const { t, ds, later } = await unknown(true)
      t.ledger.setOnline(false)
      expect(await reconcileOnce(later)).to.deep.equal({ committed: 0, failed: 0, unknown: 3, released: 0 })
      for (const d of ds) expect(await t.status(d.id)).to.equal("MENUNGGU_KONFIRMASI")
    })
  })
})
