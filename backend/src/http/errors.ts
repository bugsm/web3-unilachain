import type { ErrorRequestHandler, RequestHandler } from "express"
import { logger } from "../log.js"

/** Galat yang aman dikirim ke klien: `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export const badRequest = (message: string) => new ApiError(400, "VALIDATION", message)
export const forbidden = (message = "Anda tidak berwenang untuk tindakan ini.") => new ApiError(403, "FORBIDDEN", message)
export const notFound = (message: string) => new ApiError(404, "NOT_FOUND", message)
export const conflict = (message: string) => new ApiError(409, "CONFLICT", message)

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(notFound("Rute tidak ditemukan."))

/** Pesan klien tanpa stack trace, path, atau isi sertifikat; rincian hanya di log server. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } })
    return
  }
  // body-parser: JSON rusak atau terlalu besar.
  const status = typeof err?.status === "number" ? err.status : 500
  if (status === 400 || status === 413) {
    res.status(status).json({ error: { code: "VALIDATION", message: "Isi permintaan tidak valid." } })
    return
  }
  logger.error({ err, method: req.method, url: req.originalUrl }, "galat tak terduga")
  res.status(500).json({ error: { code: "ERROR", message: "Terjadi kesalahan." } })
}
