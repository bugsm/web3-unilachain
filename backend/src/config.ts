import { z } from "zod"

/** Semua nilai beda lingkungan dibaca dari env (CLAUDE.md §2). Start gagal bila ada yang hilang. */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET minimal 32 karakter"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  FABRIC_CHANNEL: z.string().min(1).default("skpi-channel"),
  FABRIC_CHAINCODE: z.string().min(1).default("skpi"),
  FABRIC_MSP_ID: z.string().min(1).default("UnilaMSP"),
  FABRIC_PEER_ENDPOINT: z.string().min(1),
  FABRIC_PEER_HOST_ALIAS: z.string().min(1),
  FABRIC_TLS_CA_PATH: z.string().min(1),
  FABRIC_WALLET_DIR: z.string().min(1),
  FABRIC_READER_IDENTITY: z.string().min(1).default("app-reader"),
  FABRIC_EVALUATE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  FABRIC_ENDORSE_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  FABRIC_SUBMIT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  FABRIC_COMMIT_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  RECONCILE_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  VERIFY_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
  LOGIN_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
})

export type Config = ReturnType<typeof loadConfig>

export function loadConfig(env: Record<string, string | undefined>) {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    throw new Error(`Konfigurasi tidak valid: ${fields}`)
  }
  const e = parsed.data
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    cookieSecure: e.COOKIE_SECURE,
    fabric: {
      channel: e.FABRIC_CHANNEL,
      chaincode: e.FABRIC_CHAINCODE,
      mspId: e.FABRIC_MSP_ID,
      peerEndpoint: e.FABRIC_PEER_ENDPOINT,
      peerHostAlias: e.FABRIC_PEER_HOST_ALIAS,
      tlsCaPath: e.FABRIC_TLS_CA_PATH,
      walletDir: e.FABRIC_WALLET_DIR,
      readerIdentity: e.FABRIC_READER_IDENTITY,
      timeouts: {
        evaluateMs: e.FABRIC_EVALUATE_TIMEOUT_MS,
        endorseMs: e.FABRIC_ENDORSE_TIMEOUT_MS,
        submitMs: e.FABRIC_SUBMIT_TIMEOUT_MS,
        commitMs: e.FABRIC_COMMIT_TIMEOUT_MS,
      },
    },
    reconcileIntervalMs: e.RECONCILE_INTERVAL_MS,
    verifyRateLimitPerMin: e.VERIFY_RATE_LIMIT_PER_MIN,
    loginRateLimitPerMin: e.LOGIN_RATE_LIMIT_PER_MIN,
  }
}
