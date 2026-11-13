/*
 * Pengiriman banyak transaksi sekaligus agar masuk blok yang sama. Dua tahap:
 *  1. endorse semua secara paralel (lama tiap endorsement berbeda-beda, apalagi lewat terowongan WAN);
 *  2. setelah SEMUA selesai, kirim ke orderer serentak: seluruh submit dipanggil dalam satu tick, sehingga tiba di orderer
 *     dalam hitungan milidetik, di dalam jendela RequestBatchMaxInterval (50 ms) dan dipotong menjadi satu blok.
 * Variasi waktu endorsement (penyebab transaksi tercecer ke banyak blok) tidak lagi memengaruhi isi blok.
 * Logika ini murni (tanpa gateway nyata) agar urutannya dapat diuji.
 */
import { LedgerError } from "./ledger.js"

export type Stage = "endorse" | "submit" | "commit"

export interface CommitLike {
  getStatus(): Promise<{ successful: boolean; code: number }>
}
export interface SignedLike {
  submit(): Promise<CommitLike>
  getResult(): Uint8Array
}
export interface ProposalLike {
  getTransactionId(): string
  endorse(): Promise<SignedLike>
}

export type BatchItemResult = { ok: true; txId: string; result: string } | { ok: false; error: LedgerError }

export interface BatchHooks {
  /** Dipanggil setelah endorse tiap item, sebelum dikirim ke orderer (catat transaksi tertunda). Galatnya menggagalkan item itu. */
  onSubmitting?: (index: number, txId: string) => Promise<void>
  classify: (e: unknown, stage: Stage, txId?: string) => LedgerError
  /** Galat untuk transaksi yang ter-commit tetapi tidak valid (kode validasi peer). */
  invalid: (code: number) => LedgerError
  decode: (b: Uint8Array) => string
}

export async function runBatch(proposals: readonly ProposalLike[], h: BatchHooks): Promise<BatchItemResult[]> {
  const out = new Array<BatchItemResult>(proposals.length)

  // Tahap 1: endorse paralel; kegagalan satu item tidak menghentikan yang lain.
  const endorsed = await Promise.all(
    proposals.map(async (p, index) => {
      let txId: string | undefined
      try {
        txId = p.getTransactionId()
        const tx = await p.endorse()
        await h.onSubmitting?.(index, txId)
        return { index, txId, tx }
      } catch (e) {
        out[index] = { ok: false, error: h.classify(e, "endorse", txId) }
        return null
      }
    }),
  )

  // Tahap 2: tiap fungsi async menjalankan tx.submit() secara sinkron di awalnya, jadi map() mengirim semuanya di tick yang sama.
  await Promise.all(
    endorsed.map(async (item) => {
      if (!item) return
      const { index, txId, tx } = item
      let stage: Stage = "submit"
      try {
        const commit = await tx.submit()
        stage = "commit"
        const status = await commit.getStatus()
        if (!status.successful) throw h.invalid(status.code)
        out[index] = { ok: true, txId, result: h.decode(tx.getResult()) }
      } catch (e) {
        out[index] = { ok: false, error: h.classify(e, stage, txId) }
      }
    }),
  )
  return out
}
