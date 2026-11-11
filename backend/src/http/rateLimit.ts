import { rateLimit } from "express-rate-limit"
import { ApiError } from "./errors.js"

/** Batas per IP per menit (IP asli dari nginx lewat `trust proxy`). */
export function perMinute(limit: number) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new ApiError(429, "RATE_LIMITED", "Terlalu banyak permintaan, coba lagi dalam beberapa saat.")),
  })
}
