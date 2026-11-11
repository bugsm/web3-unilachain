import { pino } from "pino"

/** Log JSON ke stdout (kontainer). LOG_LEVEL=silent dipakai test. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: { paths: ["req.headers.cookie", "*.password", "*.passwordHash", "*.privateKey"], censor: "[disembunyikan]" },
})
