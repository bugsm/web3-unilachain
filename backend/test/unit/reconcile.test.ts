import { expect } from "chai"
import type { SkpiInput } from "../../src/domain/skpi.js"
import { reconcileOnce } from "../../src/services/reconcile.js"
import { testConfig } from "../helpers/app.js"
import { expectApiError, startContract } from "../helpers/contract.js"

const input: SkpiInput = { npm: "2317051001", name: "Nabila Azzahra", skpiId: "001/UN26.17/SKPI/2026", programStudy: "S1 Ilmu Komputer", totalSKP: 180 }
const { npm: _n, ...data } = input

async function setup() {
  const c = await startContract()
  const ctx = { config: testConfig, pool: c.pool, ledger: c.ledger, now: () => new Date() }
  /** Jam setelah batas waktu jalur normal (endorse + submit + commit + 30 s = 125 s) lewat. */
  const later = { ...ctx, now: () => new Date(Date.now() + 3 * 60_000) }
  await c.loginAs("admin.fmipa@unila.ac.id")
  const d = await c.client.createDraft({ type: "PENCATATAN", npm: input.npm, data })
  await c.loginAs("dekan.fmipa@unila.ac.id")
  const status = async () => (await c.pool.query("SELECT status FROM drafts WHERE id = $1", [d.id])).rows[0].status
  const txRows = async () => (await c.pool.query("SELECT status FROM ledger_tx ORDER BY created_at")).rows.map((r) => r.status)
  return { ...c, ctx, later, d, status, txRows }
}

describe("rekonsiliasi transaksi yang statusnya belum pasti", () => {
  it("transaksi ternyata ter-commit → draft DISETUJUI, proyeksi dan peristiwa ledger dengan txId yang sama", async () => {
    const t = await setup()
    t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied: true })
    await expectApiError(t.client.approveDraft(t.d.id), 503)
    expect(await reconcileOnce(t.later)).to.deep.equal({ committed: 1, failed: 0, unknown: 0, released: 0 })
    expect(await t.status()).to.equal("DISETUJUI")
    expect(await t.txRows()).to.deep.equal(["COMMITTED"])
    const ev = (await t.pool.query("SELECT action, actor, tx_id FROM events WHERE kind = 'ledger'")).rows
    const [txId] = [...t.ledger.txs.keys()]
    expect(ev).to.deep.equal([{ action: "SahkanDekan", actor: "dekan-fmipa@UnilaMSP", tx_id: txId }])
    expect((await t.client.getRecord(input.npm)).status).to.equal("MENUNGGU_REKTOR")
  })

  it("transaksi tidak valid → draft kembali menunggu dan dapat disetujui ulang", async () => {
    const t = await setup()
    t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied: false })
    await expectApiError(t.client.approveDraft(t.d.id), 503)
    expect(await reconcileOnce(t.later)).to.deep.include({ failed: 1 })
    expect(await t.status()).to.equal("MENUNGGU_DEKAN")
    await t.client.approveDraft(t.d.id)
    expect(await t.status()).to.equal("DISETUJUI")
  })

  it("peer mati → tidak ada yang berubah", async () => {
    const t = await setup()
    t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied: true })
    await expectApiError(t.client.approveDraft(t.d.id), 503)
    t.ledger.setOnline(false)
    expect(await reconcileOnce(t.later)).to.deep.equal({ committed: 0, failed: 0, unknown: 1, released: 0 })
    expect(await t.status()).to.equal("MENUNGGU_KONFIRMASI")
    expect(await t.txRows()).to.deep.equal(["PENDING"])
  })

  it("transaksi tak dikenal ledger melewati batas waktu → dianggap gagal, draft dilepas", async () => {
    const t = await setup()
    t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied: false })
    await expectApiError(t.client.approveDraft(t.d.id), 503)
    t.ledger.txs.clear() // ledger tidak pernah melihat transaksi ini
    expect(await reconcileOnce(t.later)).to.deep.include({ unknown: 1 })
    expect(await t.status()).to.equal("MENUNGGU_KONFIRMASI")
    const later = { ...t.ctx, now: () => new Date(Date.now() + 11 * 60_000) }
    expect(await reconcileOnce(later)).to.deep.include({ failed: 1 })
    expect(await t.status()).to.equal("MENUNGGU_DEKAN")
  })

  it("draft menunggu konfirmasi tanpa transaksi tercatat (proses mati sebelum kirim) dilepas setelah 2 menit", async () => {
    const t = await setup()
    await t.pool.query("UPDATE drafts SET status = 'MENUNGGU_KONFIRMASI' WHERE id = $1", [t.d.id])
    expect(await reconcileOnce(t.ctx)).to.deep.include({ released: 0 })
    const later = { ...t.ctx, now: () => new Date(Date.now() + 3 * 60_000) }
    expect(await reconcileOnce(later)).to.deep.include({ released: 1 })
    expect(await t.status()).to.equal("MENUNGGU_DEKAN")
  })

  it("rektor: commit ternyata tercatat → peristiwa SahkanRektor dan NPM tidak lagi terkunci", async () => {
    const t = await setup()
    await t.client.approveDraft(t.d.id)
    await t.loginAs("rektor@unila.ac.id")
    t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied: true })
    await expectApiError(t.client.rektorApprove(input.npm), 503)
    expect(await reconcileOnce(t.later)).to.deep.include({ committed: 1 })
    const rec = await t.client.getRecord(input.npm)
    expect(rec.status).to.equal("AKTIF")
    expect(rec.history.at(-1)).to.deep.include({ action: "SahkanRektor", actor: "rektor@UnilaMSP" })
    await expectApiError(t.client.rektorApprove(input.npm), 409)
  })

  it("transaksi yang masih diproses jalur normal tidak disentuh rekonsiliasi", async () => {
    const t = await setup()
    t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied: true })
    await expectApiError(t.client.approveDraft(t.d.id), 503)
    expect(await reconcileOnce(t.ctx)).to.deep.equal({ committed: 0, failed: 0, unknown: 0, released: 0 })
    expect(await t.txRows()).to.deep.equal(["PENDING"])
  })

  it("hasil commit dicatat sekali walau jalur normal dan rekonsiliasi sama-sama mencatatnya", async () => {
    const t = await setup()
    t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied: true })
    await expectApiError(t.client.approveDraft(t.d.id), 503)
    await Promise.all([reconcileOnce(t.later), reconcileOnce(t.later)])
    const n = (await t.pool.query("SELECT count(*)::int AS n FROM events WHERE kind = 'ledger'")).rows[0].n
    expect(n).to.equal(1)
  })

  it("transaksi tak dikenal peer (mis. peer tertinggal blok) tetapi efeknya sudah ada di ledger → dicatat, bukan dilepas", async () => {
    const t = await setup()
    t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied: true })
    await expectApiError(t.client.approveDraft(t.d.id), 503)
    t.ledger.txs.clear()
    const giveUp = { ...t.ctx, now: () => new Date(Date.now() + 11 * 60_000) }
    expect(await reconcileOnce(giveUp)).to.deep.include({ committed: 1, failed: 0 })
    expect(await t.status()).to.equal("DISETUJUI")
  })

  it("satu baris yang gagal dibaca tidak menghentikan baris lain", async () => {
    const t = await setup()
    t.ledger.failNextSubmitWith("COMMIT_UNKNOWN", { applied: true })
    await expectApiError(t.client.approveDraft(t.d.id), 503)
    await t.pool.query("INSERT INTO ledger_tx (tx_id, npm, fn, identity, status, created_at) VALUES ('rusak', '2317051999', 'SahkanRektor', 'rektor', 'PENDING', now() - interval '1 hour')")
    t.ledger.txs.set("rusak", "COMMITTED") // tercatat, tetapi aset tidak ada → BacaSKPI gagal
    const r = await reconcileOnce(t.later)
    expect(r.committed).to.equal(1)
    expect(await t.status()).to.equal("DISETUJUI")
  })
})
