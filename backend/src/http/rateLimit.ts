import { rateLimit } from "express-rate-limit"
import { ApiError } from "./errors.js"

/** Batas per IP per menit (IP asli dari nginx lewat `trust proxy`). */
export function perMinute(limit: number, opts: { onlyFailures?: boolean } = {}) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    // Login: hanya percobaan gagal yang dihitung (perlindungan tebak sandi), bukan staf yang berganti akun.
    skipSuccessfulRequests: opts.onlyFailures ?? false,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new ApiError(429, "RATE_LIMITED", "Terlalu banyak permintaan, coba lagi dalam beberapa saat.")),
  })
}
