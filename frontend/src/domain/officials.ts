import type { Office, OfficialPeriod, User } from "@/api/types"

const wibFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" })

/** Tanggal kalender WIB (YYYY-MM-DD) dari timestamp ISO. */
export const wibDate = (iso: string) => wibFmt.format(new Date(iso))

/** Nama pejabat yang menjabat pada hari WIB timestamp tersebut; null bila tidak ada periode yang cocok. */
export function nameAt(periods: OfficialPeriod[], iso: string): string | null {
  if (!iso) return null
  const day = wibDate(iso)
  return periods.find((p) => p.from <= day && (p.to === null || day <= p.to))?.name ?? null
}

const CONTROL = /[\u0000-\u001f\u007f]/

export const normalizeOfficialName = (v: string) => v.trim().replace(/ +/g, " ")

export function validateOfficialName(v: string): string | undefined {
  const s = normalizeOfficialName(v)
  if (CONTROL.test(v) || s.length < 3 || s.length > 150) return "Nama 3–150 karakter, tanpa karakter kontrol."
  return undefined
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v)

/** Tanggal mulai pejabat baru: setelah mulai periode berjalan dan tidak melewati hari ini (WIB). */
export function validateSuccession(periods: OfficialPeriod[], from: string, today: string): string | undefined {
  const current = periods[periods.length - 1]
  if (!isDate(from) || (current && from <= current.from) || from > today)
    return `Tanggal mulai harus setelah ${current?.from ?? "periode berjalan"} dan tidak di masa depan.`
  return undefined
}

/** Tanggal sehari sebelum `day` (YYYY-MM-DD). */
export function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** Rektor: admin fakultas mana pun. Dekan: hanya admin fakultas yang sama. */
export const canEditOffice = (user: User, office: Office) =>
  user.role === "admin" && (office === "REKTOR" || office === user.faculty)

export const OFFICE_LABEL = (office: Office) => (office === "REKTOR" ? "Rektor" : `Dekan ${office}`)

/** Data awal dari pengguna (11 Nov 2026). Tanggal mulai 2023-01-01 hanya contoh. */
export const INITIAL_OFFICIALS: Array<{ office: Office; name: string }> = [
  { office: "REKTOR", name: "Prof. Dr. Ir. Lusmeilia Afriani, D.E.A., IPM., ASEAN Eng." },
  { office: "FEB", name: "Prof. Dr. Nairobi, S.E., M.Si." },
  { office: "FH", name: "Dr. Muhammad Fakih, S.H., M.S." },
  { office: "FKIP", name: "Dr. Albet Maydiantoro, S.Pd., M.Pd." },
  { office: "FP", name: "Dr. Ir. Kuswanta Futas Hidayat, M.P." },
  { office: "FT", name: "Dr. Hi. Ahmad Herison, S.T., M.T." },
  { office: "FISIP", name: "Prof. Dr. Anna Gustina Zainal, S.Sos., M.Si." },
  { office: "FMIPA", name: "Dr. Eng. Heri Satria, S.Si., M.Si." },
  { office: "FK", name: "Dr. dr. Evi Kurniawaty, M.Sc." },
]
export const INITIAL_FROM = "2023-01-01"
