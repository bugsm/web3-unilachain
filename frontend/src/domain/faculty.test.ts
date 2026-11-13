import { FACULTIES, facultyByCode, facultyOfNpm, issuerLabel } from "./faculty"

test("digit ke-4 NPM menunjukkan fakultas", () => {
  expect(facultyOfNpm("2317051001")).toBe("FMIPA")
  expect(facultyOfNpm("2311051001")).toBe("FEB")
  expect(facultyOfNpm("2309051001")).toBeNull()
  expect(facultyOfNpm("abc")).toBeNull()
})

test("label penerbit", () => {
  expect(issuerLabel("FT")).toBe("Dekan Fakultas Teknik")
})

test("kode unit sesuai pengesah.conf", () => {
  expect(facultyByCode("FMIPA").unitCode).toBe("UN26.17")
  expect(facultyByCode("FEB").unitCode).toBe("UN26.11")
  expect(facultyByCode("FK").unitCode).toBe("UN26.18")
  expect(FACULTIES).toHaveLength(8)
})

test("FMIPA memiliki tujuh program studi, Ilmu Komputer tetap pilihan awal", () => {
  expect(facultyByCode("FMIPA").programs).toEqual([
    "S1 Ilmu Komputer",
    "D3 Manajemen Informatika",
    "S1 Matematika",
    "S1 Biologi",
    "S1 Biologi Terapan",
    "S1 Kimia",
    "S1 Fisika",
  ])
})
