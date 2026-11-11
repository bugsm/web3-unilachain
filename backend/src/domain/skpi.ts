/* Port dari frontend/src/domain/skpi.ts (pra-validasi; chaincode tetap penentu). */
import { facultyByCode, facultyOfNpm, type FacultyCode } from "./faculty.js"

export type Predicate = "Unggul" | "Sangat Baik" | "Baik" | "Cukup"

/** Nilai yang dikirim ke SahkanDekan / PerbaruiSKPI. */
export interface SkpiInput {
  npm: string
  name: string
  skpiId: string
  programStudy: string
  totalSKP: number
}

/** Nilai formulir (string mentah dari input). */
export interface SkpiForm {
  npm: string
  name: string
  skpiId: string
  programStudy: string
  totalSKP: string
}

export type FormErrors = Partial<Record<keyof SkpiForm, string>>

export const SKP_MINIMUM = 25
const MAX_TEXT = 100
const MAX_SKPI_ID = 64
const MIN_REASON = 10
const MAX_REASON = 500
const SKPI_ID = /^\d{3,}\/(UN26\.\d{1,2})\/SKPI\/\d{4}$/
const CONTROL = /[\u0000-\u001f\u007f]/

/* Tabel §4 desain-alur-pengesahan.md, sama dengan chaincode. */
const PREDICATES: Array<{ min: number; label: Predicate; range: string }> = [
  { min: 226, label: "Unggul", range: "> 225" },
  { min: 151, label: "Sangat Baik", range: "151–225" },
  { min: 76, label: "Baik", range: "76–150" },
  { min: SKP_MINIMUM, label: "Cukup", range: "25–75" },
]

export function predicateOf(total: number): Predicate | null {
  return PREDICATES.find((p) => total >= p.min)?.label ?? null
}

export function predicateRange(p: Predicate): string {
  return PREDICATES.find((x) => x.label === p)!.range
}

export const normalizeNpm = (v: string) => v.replace(/\s+/g, "")
export const normalizeName = (v: string) => v.trim().replace(/\s+/g, " ")

function textError(v: string): boolean {
  const s = normalizeName(v)
  return s.length < 1 || s.length > MAX_TEXT || CONTROL.test(v)
}

export function validateSkpi(form: SkpiForm, faculty: FacultyCode): FormErrors {
  const e: FormErrors = {}
  const npm = normalizeNpm(form.npm)
  if (!/^\d{10}$/.test(npm)) e.npm = "NPM harus 10 digit angka."
  else if (facultyOfNpm(npm) !== faculty) e.npm = `NPM ${npm} bukan mahasiswa ${faculty}.`

  if (textError(form.name)) e.name = "Nama lulusan wajib diisi (maks. 100 karakter)."

  const skpiId = form.skpiId.trim()
  const unitCode = facultyByCode(faculty).unitCode
  const m = skpiId.match(SKPI_ID)
  if (!m || skpiId.length > MAX_SKPI_ID) e.skpiId = "Format nomor SKPI: NNN/UN26.KK/SKPI/YYYY."
  else if (m[1] !== unitCode) e.skpiId = `Kode unit harus ${unitCode} untuk ${faculty}.`

  if (textError(form.programStudy) || !facultyByCode(faculty).programs.includes(form.programStudy))
    e.programStudy = "Program studi tidak ada di fakultas ini."

  const total = form.totalSKP.trim()
  if (!/^\d+$/.test(total)) e.totalSKP = "Total SKP harus bilangan bulat."
  else if (Number(total) < SKP_MINIMUM) e.totalSKP = "Total SKP minimal 25."
  return e
}

export function toInput(form: SkpiForm): SkpiInput {
  return {
    npm: normalizeNpm(form.npm),
    name: normalizeName(form.name),
    skpiId: form.skpiId.trim(),
    programStudy: form.programStudy,
    totalSKP: Number(form.totalSKP.trim()),
  }
}

export function toForm(input: SkpiInput): SkpiForm {
  return { ...input, totalSKP: String(input.totalSKP) }
}

/** Chaincode menolak karakter kontrol (termasuk baris baru): alasan dikirim sebagai satu baris. */
export const normalizeReason = (v: string) => v.replace(/\s+/g, " ").trim()

export function validateReason(v: string): string | undefined {
  const s = normalizeReason(v)
  if (s.length < MIN_REASON) return "Alasan minimal 10 karakter."
  if (s.length > MAX_REASON) return "Alasan maksimal 500 karakter."
  return undefined
}
