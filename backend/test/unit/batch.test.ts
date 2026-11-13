import { expect } from "chai"
import { runBatch, type BatchHooks, type ProposalLike } from "../../src/fabric/batch.js"
import { LedgerError } from "../../src/fabric/ledger.js"

const tick = () => new Promise<void>((r) => setTimeout(r, 0))
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface Trace {
  events: string[]
}

/** Proposal tiruan: endorse selesai setelah `endorseMs`, lalu submit/commit dicatat urutannya di `trace`. */
function proposal(id: string, trace: Trace, o: { endorseMs?: number; endorseFails?: Error; submitFails?: Error; commit?: { successful: boolean; code: number }; commitFails?: Error } = {}): ProposalLike {
  return {
    getTransactionId: () => id,
    async endorse() {
      trace.events.push(`endorse:start:${id}`)
      await wait(o.endorseMs ?? 0)
      if (o.endorseFails) throw o.endorseFails
      trace.events.push(`endorse:done:${id}`)
      return {
        submit() {
          trace.events.push(`submit:${id}`)
          if (o.submitFails) return Promise.reject(o.submitFails)
          return Promise.resolve({
            async getStatus() {
              trace.events.push(`status:${id}`)
              await tick()
              if (o.commitFails) throw o.commitFails
              return o.commit ?? { successful: true, code: 0 }
            },
          })
        },
        getResult: () => new TextEncoder().encode(`hasil-${id}`),
      }
    },
  }
}

const hooks = (over: Partial<BatchHooks> = {}): BatchHooks => ({
  classify: (e, stage, txId) => (e instanceof LedgerError ? e : new LedgerError(stage === "commit" ? "COMMIT_UNKNOWN" : "UNAVAILABLE", String(e), txId)),
  invalid: (code) => new LedgerError("ERROR", `Transaksi tidak valid: ${code}`),
  decode: (b) => new TextDecoder().decode(b),
  ...over,
})

describe("runBatch: endorse semua dulu, lalu kirim serentak", () => {
  it("tidak ada submit sebelum SEMUA endorsement selesai, walau waktu endorsement berbeda-beda", async () => {
    const trace: Trace = { events: [] }
    const ps = [proposal("a", trace, { endorseMs: 40 }), proposal("b", trace, { endorseMs: 5 }), proposal("c", trace, { endorseMs: 20 })]
    await runBatch(ps, hooks())
    const firstSubmit = trace.events.findIndex((e) => e.startsWith("submit:"))
    const lastEndorse = trace.events.map((e, i) => (e.startsWith("endorse:done") ? i : -1)).reduce((m, i) => Math.max(m, i), -1)
    expect(firstSubmit).to.be.greaterThan(lastEndorse)
  })

  it("semua submit dipanggil di tick yang sama (berurutan tanpa menunggu), sebelum status commit pertama dibaca", async () => {
    const trace: Trace = { events: [] }
    const ps = ["a", "b", "c", "d"].map((id, i) => proposal(id, trace, { endorseMs: i * 7 }))
    await runBatch(ps, hooks())
    const submits = trace.events.map((e, i) => (e.startsWith("submit:") ? i : -1)).filter((i) => i >= 0)
    const firstStatus = trace.events.findIndex((e) => e.startsWith("status:"))
    expect(submits).to.have.length(4)
    expect(submits[3] - submits[0]).to.equal(3) // berurutan tanpa kejadian lain di antaranya
    expect(Math.max(...submits)).to.be.lessThan(firstStatus)
  })

  it("hasil mengikuti urutan input dan memuat txId serta hasil chaincode", async () => {
    const trace: Trace = { events: [] }
    const out = await runBatch([proposal("a", trace, { endorseMs: 30 }), proposal("b", trace)], hooks())
    expect(out).to.deep.equal([
      { ok: true, txId: "a", result: "hasil-a" },
      { ok: true, txId: "b", result: "hasil-b" },
    ])
  })

  it("onSubmitting dipanggil setelah endorse tiap item (indeks + txId) dan sebelum submit mana pun", async () => {
    const trace: Trace = { events: [] }
    const calls: string[] = []
    await runBatch([proposal("a", trace), proposal("b", trace, { endorseMs: 10 })], hooks({
      onSubmitting: async (i, id) => {
        calls.push(`${i}:${id}`)
        trace.events.push(`onSubmitting:${id}`)
      },
    }))
    expect(calls.sort()).to.deep.equal(["0:a", "1:b"])
    const lastHook = Math.max(...trace.events.map((e, i) => (e.startsWith("onSubmitting") ? i : -1)))
    expect(trace.events.findIndex((e) => e.startsWith("submit:"))).to.be.greaterThan(lastHook)
  })

  it("endorsement yang gagal hanya menggagalkan item itu; yang lain tetap dikirim bersama", async () => {
    const trace: Trace = { events: [] }
    const out = await runBatch(
      [proposal("a", trace), proposal("b", trace, { endorseFails: new LedgerError("REJECTED", "Akses ditolak: x") }), proposal("c", trace)],
      hooks(),
    )
    expect(out[0]).to.include({ ok: true, txId: "a" })
    expect(out[1].ok).to.equal(false)
    if (!out[1].ok) expect(out[1].error.kind).to.equal("REJECTED")
    expect(out[2]).to.include({ ok: true, txId: "c" })
    expect(trace.events.filter((e) => e.startsWith("submit:"))).to.deep.equal(["submit:a", "submit:c"])
  })

  it("onSubmitting yang gagal mencegah item itu dikirim ke orderer", async () => {
    const trace: Trace = { events: [] }
    const out = await runBatch([proposal("a", trace), proposal("b", trace)], hooks({
      onSubmitting: async (i) => {
        if (i === 1) throw new Error("DB mati")
      },
    }))
    expect(out[0].ok).to.equal(true)
    expect(out[1].ok).to.equal(false)
    expect(trace.events).to.not.include("submit:b")
  })

  it("galat submit dan galat menunggu commit diklasifikasi per tahap, tanpa mengganggu item lain", async () => {
    const trace: Trace = { events: [] }
    const stages: string[] = []
    const out = await runBatch(
      [proposal("a", trace), proposal("b", trace, { submitFails: new Error("orderer") }), proposal("c", trace, { commitFails: new Error("timeout") })],
      hooks({
        classify: (e, stage, txId) => {
          stages.push(`${stage}:${txId}`)
          return new LedgerError("COMMIT_UNKNOWN", String(e), txId)
        },
      }),
    )
    expect(out[0].ok).to.equal(true)
    expect(out[1].ok).to.equal(false)
    expect(out[2].ok).to.equal(false)
    expect(stages.sort()).to.deep.equal(["commit:c", "submit:b"])
  })

  it("commit tidak valid (mis. konflik MVCC dalam blok yang sama) dipetakan lewat hook invalid", async () => {
    const trace: Trace = { events: [] }
    const out = await runBatch(
      [proposal("a", trace), proposal("b", trace, { commit: { successful: false, code: 11 } })],
      hooks({ invalid: (code) => new LedgerError("REJECTED", `ditolak ${code}`) }),
    )
    expect(out[0].ok).to.equal(true)
    expect(out[1].ok).to.equal(false)
    if (!out[1].ok) expect(out[1].error).to.include({ kind: "REJECTED", message: "ditolak 11" })
  })

  it("daftar kosong menghasilkan hasil kosong tanpa memanggil apa pun", async () => {
    expect(await runBatch([], hooks())).to.deep.equal([])
  })
})
