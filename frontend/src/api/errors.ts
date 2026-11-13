export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

const BY_STATUS: Record<number, string> = {
  0: "Layanan ledger sedang tidak terjangkau.",
  401: "Sesi berakhir, silakan masuk kembali.",
  403: "Anda tidak berwenang untuk tindakan ini.",
  429: "Terlalu banyak permintaan, coba lagi dalam beberapa saat.",
  502: "Layanan ledger sedang tidak terjangkau.",
  503: "Layanan ledger sedang tidak terjangkau.",
}

/** Pesan yang aman ditampilkan ke pengguna. */
export function userMessage(e: unknown): string {
  if (e instanceof ApiError) {
    // Galat login membawa pesannya sendiri (mis. sandi salah).
    if (e.code === "INVALID_CREDENTIALS") return e.message
    // Transaksi sudah dikirim tetapi konfirmasinya terlambat: mungkin sudah tercatat, jadi bukan "ledger tidak terjangkau".
    if (e.code === "COMMIT_UNKNOWN") return "Status transaksi belum pasti; sistem sedang memastikannya di ledger."
    return BY_STATUS[e.status] ?? (e.message || "Terjadi kesalahan.")
  }
  return "Terjadi kesalahan."
}

/** Ledger/peer tidak terjangkau: peer mati (502/503) atau server aplikasi sendiri tidak dapat dihubungi (0). */
export function isLedgerDown(e: unknown): boolean {
  return e instanceof ApiError && e.code !== "COMMIT_UNKNOWN" && (e.status === 0 || e.status === 502 || e.status === 503)
}
