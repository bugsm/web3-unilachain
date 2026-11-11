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
 */
export type LedgerErrorKind = "REJECTED" | "UNAVAILABLE" | "COMMIT_UNKNOWN"

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
