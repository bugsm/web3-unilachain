import type { BatchItemResult } from "./batch.js"

export type { BatchItemResult } from "./batch.js"

/**
 * Batas antara layanan dan jaringan Fabric. Implementasi nyata: gateway.ts; test memakai FakeLedger.
 * `identity` = label di wallet (dekan-<fakultas>, rektor, app-reader).
 */
export interface Ledger {
  /**
   * Endorse + submit + tunggu commit. Resolve hanya bila transaksi sudah ter-commit valid.
   * `onSubmitting(txId)` dipanggil setelah endorse, sebelum dikirim ke orderer: tempat mencatat transaksi tertunda
   * sehingga rekonsiliasi dapat menyelesaikannya walau proses mati di tengah.
   */
  submit(
    identity: string,
    fn: string,
    args: string[],
    onSubmitting?: (txId: string) => Promise<void>,
  ): Promise<{ txId: string; result: string }>
  /**
   * Banyak transaksi sekaligus agar masuk blok yang sama: endorse semua paralel, lalu kirim serentak ke orderer
   * (lihat batch.ts). Hasil per item, sesuai urutan input; kegagalan satu item tidak menggagalkan yang lain.
   * `onSubmitting(index, txId)` seperti pada `submit`. Tidak pernah melempar: galat umum (peer mati) menjadi hasil gagal tiap item.
   */
  submitBatch(
    identity: string,
    items: Array<{ fn: string; args: string[] }>,
    onSubmitting?: (index: number, txId: string) => Promise<void>,
  ): Promise<BatchItemResult[]>
  evaluate(identity: string, fn: string, args: string[]): Promise<string>
  /** Tinggi chain (qscc GetChainInfo). */
  chainHeight(): Promise<number>
  txStatus(txId: string): Promise<"COMMITTED" | "INVALID" | "UNKNOWN">
  close(): Promise<void>
}

/**
 * REJECTED: chaincode/peer menolak (tidak ada yang tertulis).
 * UNAVAILABLE: peer tidak terjangkau sebelum transaksi terkirim (tidak ada yang tertulis).
 * COMMIT_UNKNOWN: sudah terkirim ke orderer, status commit belum diketahui (txId dibawa untuk rekonsiliasi).
 * ERROR: galat ledger lain (bukan penolakan chaincode); rincian hanya untuk log server.
 */
export type LedgerErrorKind = "REJECTED" | "UNAVAILABLE" | "COMMIT_UNKNOWN" | "ERROR"

export class LedgerError extends Error {
  constructor(
    public readonly kind: LedgerErrorKind,
    message: string,
    public readonly txId?: string,
  ) {
    super(message)
    this.name = "LedgerError"
  }
}
