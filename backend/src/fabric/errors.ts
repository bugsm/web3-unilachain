import { ApiError } from "../http/errors.js"
import { logger } from "../log.js"
import { LedgerError } from "./ledger.js"

const sentence = (m: string) => {
  const t = m.trim()
  return /[.!?]$/.test(t) ? t : `${t}.`
}

/**
 * Pesan chaincode berbahasa Indonesia dan konsisten (desain-alur-pengesahan.md), sehingga statusnya dapat dipetakan
 * dari isinya. Pesan penolakan chaincode aman ditampilkan; galat lain disamarkan.
 */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  // Rincian teknis hanya ke log server (spec §5.4); pesan galat tidak memuat kunci atau isi sertifikat.
  if (!(e instanceof LedgerError)) {
    logger.error({ err: e }, "galat ledger tak terduga")
    return new ApiError(502, "LEDGER_ERROR", "Ledger mengembalikan galat.")
  }
  logger.warn({ kind: e.kind, message: e.message, txId: e.txId }, "galat ledger")
  if (e.kind === "ERROR") return new ApiError(502, "LEDGER_ERROR", "Ledger mengembalikan galat.")
  if (e.kind === "UNAVAILABLE") return new ApiError(503, "UNAVAILABLE", "Layanan ledger sedang tidak terjangkau.")
  if (e.kind === "COMMIT_UNKNOWN")
    return new ApiError(503, "COMMIT_UNKNOWN", "Status transaksi belum pasti; sistem akan memeriksanya kembali.")

  const m = e.message
  if (/MVCC_READ_CONFLICT|PHANTOM_READ_CONFLICT/.test(m))
    return new ApiError(409, "CONFLICT", "Data berubah bersamaan dengan transaksi lain, coba lagi.")
  if (m.startsWith("Akses ditolak")) return new ApiError(403, "FORBIDDEN", sentence(m))
  if (/tidak ditemukan/.test(m)) return new ApiError(404, "NOT_FOUND", sentence(m))
  if (/berstatus|sudah dipakai|sudah memiliki/.test(m)) return new ApiError(409, "CONFLICT", sentence(m))
  return new ApiError(400, "VALIDATION", sentence(m))
}

/** "x509::/OU=client/CN=dekan-fmipa::/CN=ca..." → "dekan-fmipa@UnilaMSP" (penanda tangan yang mudah dibaca). */
export function actorFromId(id: string, mspId: string): string {
  const subject = id.split("::")[1] ?? ""
  const cn = /CN=([^/,]+)/.exec(subject)?.[1]
  return cn ? `${cn}@${mspId}` : ""
}
