import { z } from "zod"

/** Semua nilai beda lingkungan dibaca dari env (CLAUDE.md §2). Start gagal bila ada yang hilang. */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  // DATABASE_URL, atau DB_* (compose): sandi di-encode sehingga simbol seperti / @ : # aman.
  DATABASE_URL: z.string().min(1).optional(),
  DB_HOST: z.string().min(1).optional(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1).optional(),
  DB_USER: z.string().min(1).optional(),
  DB_PASSWORD: z.string().optional(),
  // Jumlah proxy tepercaya di depan backend: 1 = nginx frontend; 2 = ada reverse proxy HTTPS lagi di depannya.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
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
  FABRIC_SUBMIT_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  FABRIC_COMMIT_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  // Konfirmasi commit terlambat: berapa lama server memeriksa sendiri status transaksi batch sebelum menyerahkannya ke rekonsiliasi.
  FABRIC_CONFIRM_WAIT_MS: z.coerce.number().int().min(0).default(45000),
  RECONCILE_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  RECONCILE_GIVE_UP_MS: z.coerce.number().int().positive().default(600000),
  VERIFY_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
  LOGIN_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
})

export type Config = ReturnType<typeof loadConfig>

function databaseUrl(e: z.infer<typeof schema>): string {
  if (e.DATABASE_URL) return e.DATABASE_URL
  if (e.DB_HOST && e.DB_NAME && e.DB_USER) {
    const auth = `${encodeURIComponent(e.DB_USER)}:${encodeURIComponent(e.DB_PASSWORD ?? "")}`
    return `postgres://${auth}@${e.DB_HOST}:${e.DB_PORT}/${encodeURIComponent(e.DB_NAME)}`
  }
  throw new Error("Konfigurasi tidak valid: DATABASE_URL atau DB_HOST/DB_NAME/DB_USER/DB_PASSWORD wajib diisi")
}

export function loadConfig(env: Record<string, string | undefined>) {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    throw new Error(`Konfigurasi tidak valid: ${fields}`)
  }
  const e = parsed.data
  return {
    port: e.PORT,
    databaseUrl: databaseUrl(e),
    trustProxy: e.TRUST_PROXY,
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
        confirmMs: e.FABRIC_CONFIRM_WAIT_MS,
      },
    },
    reconcileIntervalMs: e.RECONCILE_INTERVAL_MS,
    reconcileGiveUpMs: e.RECONCILE_GIVE_UP_MS,
    verifyRateLimitPerMin: e.VERIFY_RATE_LIMIT_PER_MIN,
    loginRateLimitPerMin: e.LOGIN_RATE_LIMIT_PER_MIN,
  }
}
