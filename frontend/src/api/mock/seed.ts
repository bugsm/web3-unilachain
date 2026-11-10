import { issuerLabel, type FacultyCode } from "@/domain/faculty"
import type { SkpiInput } from "@/domain/skpi"
import * as ops from "./store"

type Outcome =
  | "MENUNGGU_DEKAN"
  | "DITOLAK_DEKAN"
  | "MENUNGGU_REKTOR"
  | "AKTIF"
  | "DITOLAK_REKTOR"
  | "DICABUT"
  | "AKTIF+PERUBAHAN"
  | "AKTIF+PENCABUTAN"

interface Row extends SkpiInput {
  faculty: FacultyCode
  outcome: Outcome
  note?: string
  /** Hari sebelum `now` saat draft diajukan. */
  day: number
}

const row = (
  faculty: FacultyCode,
  npm: string,
  name: string,
  seq: string,
  programStudy: string,
  totalSKP: number,
  outcome: Outcome,
  day: number,
  note?: string,
): Row => ({
  faculty,
  npm,
  name,
  skpiId: `${seq}/${faculty === "FMIPA" ? "UN26.17" : "UN26.15"}/SKPI/2026`,
  programStudy,
  totalSKP,
  outcome,
  day,
  note,
})

const ROWS: Row[] = [
  row("FMIPA", "2017051008", "Nabila Azzahra", "001", "S1 Ilmu Komputer", 236, "AKTIF", 30),
  row("FMIPA", "2017051021", "Rizky Maulana", "002", "S1 Ilmu Komputer", 180, "AKTIF+PERUBAHAN", 29),
  row("FMIPA", "2017051042", "Dhea Maharani", "003", "S1 Ilmu Komputer", 205, "DICABUT", 28,
    "Dokumen diterbitkan ulang karena kesalahan penulisan program studi."),
  row("FMIPA", "2017051056", "Fajar Pratama", "004", "S1 Ilmu Komputer", 164, "MENUNGGU_REKTOR", 9),
  row("FMIPA", "2017051088", "Citra Lestari", "005", "D3 Manajemen Informatika", 128, "MENUNGGU_REKTOR", 8),
  row("FMIPA", "2017051064", "Aulia Rahmawati", "006", "S1 Ilmu Komputer", 211, "MENUNGGU_DEKAN", 3),
  row("FMIPA", "2017051071", "Bagas Prakoso", "007", "S1 Matematika", 157, "MENUNGGU_DEKAN", 2),
  row("FMIPA", "2017051095", "Dimas Arya Saputra", "008", "S1 Ilmu Komputer", 174, "DITOLAK_DEKAN", 6,
    "Nomor SKPI tidak sesuai dengan dokumen fisik."),
  row("FMIPA", "2017051103", "Salsabila Putri Ramadhani", "009", "S1 Biologi", 248, "AKTIF+PENCABUTAN", 27,
    "SKPI diterbitkan ganda; dokumen pengganti telah dicatat."),
  row("FMIPA", "2017051117", "Muhammad Iqbal Hakim", "010", "S1 Ilmu Komputer", 143, "DITOLAK_REKTOR", 12,
    "Lampiran capaian SKP belum ditandatangani pembimbing akademik."),
  row("FT", "2015061003", "Rizky Maulana", "001", "S1 Teknik Sipil", 190, "AKTIF", 26),
  row("FT", "2015061017", "Putri Anggraini", "002", "S1 Teknik Elektro", 96, "MENUNGGU_DEKAN", 1),
  row("FT", "2015061024", "Andi Wijaya", "003", "S1 Teknik Informatika", 230, "MENUNGGU_REKTOR", 7),
  row("FT", "2015061031", "Siti Nurhaliza", "004", "S1 Teknik Sipil", 62, "AKTIF", 25),
]

const lower = (f: FacultyCode) => f.toLowerCase()

export function seedStore(s: ops.Store, now: Date) {
  const at = (day: number, hours: number) => new Date(now.getTime() - day * 86_400_000 + hours * 3_600_000).toISOString()
  const rektor = "rektor@UnilaMSP"

  for (const r of ROWS) {
    const admin = `admin.${lower(r.faculty)} (off-chain)`
    const dekan = `dekan-${lower(r.faculty)}@UnilaMSP`
    const { faculty, outcome, note, day, npm, ...data } = r
    const draft = ops.submitDraft(s, { type: "PENCATATAN", npm, data }, admin, faculty, at(day, 0))
    if (outcome === "MENUNGGU_DEKAN") continue
    if (outcome === "DITOLAK_DEKAN") {
      ops.rejectDraft(s, draft.id, note!, dekan, at(day, 5))
      continue
    }
    ops.approveDraft(s, draft.id, dekan, issuerLabel(faculty), at(day, 20))
    if (outcome === "MENUNGGU_REKTOR") continue
    if (outcome === "DITOLAK_REKTOR") {
      ops.rektorReject(s, npm, note!, rektor, at(day - 1, 4))
      continue
    }
    ops.rektorApprove(s, npm, rektor, at(day - 1, 4))
    if (outcome === "DICABUT") {
      const d = ops.submitDraft(s, { type: "PENCABUTAN", npm, reason: note }, admin, faculty, at(day - 5, 0))
      ops.approveDraft(s, d.id, dekan, issuerLabel(faculty), at(day - 5, 3))
    } else if (outcome === "AKTIF+PERUBAHAN") {
      ops.submitDraft(s, { type: "PERUBAHAN", npm, data: { ...data, totalSKP: 230 } }, admin, faculty, at(2, 1))
    } else if (outcome === "AKTIF+PENCABUTAN") {
      ops.submitDraft(s, { type: "PENCABUTAN", npm, reason: note }, admin, faculty, at(1, 2))
    }
  }
}
