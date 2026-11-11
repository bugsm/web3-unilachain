export type FacultyCode = "FEB" | "FH" | "FKIP" | "FP" | "FT" | "FISIP" | "FMIPA" | "FK"

export interface Faculty {
  code: FacultyCode
  name: string
  /** Kode unit untuk nomor SKPI; contoh riset dari network/pengesah.conf. */
  unitCode: string
  /** Digit ke-4 NPM (FAKULTAS_NPM di chaincode). */
  npmDigit: string
  programs: string[]
}

export const FACULTIES: Faculty[] = [
  {
    code: "FEB",
    name: "Fakultas Ekonomi dan Bisnis",
    unitCode: "UN26.11",
    npmDigit: "1",
    programs: ["S1 Manajemen", "S1 Akuntansi", "S1 Ekonomi Pembangunan"],
  },
  {
    code: "FH",
    name: "Fakultas Hukum",
    unitCode: "UN26.12",
    npmDigit: "2",
    programs: ["S1 Ilmu Hukum"],
  },
  {
    code: "FKIP",
    name: "Fakultas Keguruan dan Ilmu Pendidikan",
    unitCode: "UN26.13",
    npmDigit: "3",
    programs: ["S1 Pendidikan Matematika", "S1 Pendidikan Bahasa Inggris", "S1 Pendidikan Fisika"],
  },
  {
    code: "FP",
    name: "Fakultas Pertanian",
    unitCode: "UN26.14",
    npmDigit: "4",
    programs: ["S1 Agroteknologi", "S1 Agribisnis", "S1 Kehutanan"],
  },
  {
    code: "FT",
    name: "Fakultas Teknik",
    unitCode: "UN26.15",
    npmDigit: "5",
    programs: ["S1 Teknik Sipil", "S1 Teknik Elektro", "S1 Teknik Informatika"],
  },
  {
    code: "FISIP",
    name: "Fakultas Ilmu Sosial dan Ilmu Politik",
    unitCode: "UN26.16",
    npmDigit: "6",
    programs: ["S1 Ilmu Pemerintahan", "S1 Ilmu Komunikasi", "S1 Ilmu Administrasi Negara"],
  },
  {
    code: "FMIPA",
    name: "Fakultas Matematika dan Ilmu Pengetahuan Alam",
    unitCode: "UN26.17",
    npmDigit: "7",
    programs: ["S1 Ilmu Komputer", "D3 Manajemen Informatika", "S1 Matematika", "S1 Biologi"],
  },
  {
    code: "FK",
    name: "Fakultas Kedokteran",
    unitCode: "UN26.18",
    npmDigit: "8",
    programs: ["S1 Pendidikan Dokter", "S1 Farmasi"],
  },
]

export function facultyByCode(code: FacultyCode): Faculty {
  const f = FACULTIES.find((x) => x.code === code)
  if (!f) throw new Error(`Fakultas tidak dikenal: ${code}`)
  return f
}

export function facultyOfNpm(npm: string): FacultyCode | null {
  if (!/^\d{10}$/.test(npm)) return null
  return FACULTIES.find((f) => f.npmDigit === npm[3])?.code ?? null
}

export const issuerLabel = (code: FacultyCode) => `Dekan ${facultyByCode(code).name}`
