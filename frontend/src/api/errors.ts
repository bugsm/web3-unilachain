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
    if (e.status === 401 && e.code === "INVALID_CREDENTIALS") return e.message
    return BY_STATUS[e.status] ?? (e.message || "Terjadi kesalahan.")
  }
  return "Terjadi kesalahan."
}
