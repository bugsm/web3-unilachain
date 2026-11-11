import type { OfficialPeriod, User } from "@/api/types"
import {
  INITIAL_OFFICIALS,
  OFFICE_LABEL,
  canEditOffice,
  nameAt,
  normalizeOfficialName,
  validateOfficialName,
  validateSuccession,
  wibDate,
} from "./officials"

const periods: OfficialPeriod[] = [
  { id: "p1", name: "A", from: "2023-01-01", to: "2026-06-30" },
  { id: "p2", name: "B", from: "2026-07-01", to: null },
]

test("tanggal dihitung dalam WIB", () => {
  expect(wibDate("2026-06-30T18:00:00Z")).toBe("2026-07-01")
  expect(wibDate("2026-06-30T16:59:00Z")).toBe("2026-06-30")
})

test("nameAt memilih periode berdasarkan hari WIB, termasuk batas", () => {
  expect(nameAt(periods, "2026-06-30T10:00:00+07:00")).toBe("A")
  expect(nameAt(periods, "2026-07-01T00:00:00+07:00")).toBe("B")
  expect(nameAt(periods, "2026-06-30T18:00:00Z")).toBe("B")
  expect(nameAt(periods, "2022-12-31T12:00:00+07:00")).toBeNull()
})

test("validasi nama pejabat", () => {
  expect(validateOfficialName("  ab ")).toBeDefined()
  expect(validateOfficialName("a".repeat(151))).toBeDefined()
  expect(validateOfficialName("Dr. X\n")).toBeDefined()
  expect(validateOfficialName("Dr. Eng. Heri Satria, S.Si., M.Si.")).toBeUndefined()
  expect(normalizeOfficialName("  Dr.   X  ")).toBe("Dr. X")
})

test("tanggal pergantian harus setelah mulai periode berjalan dan tidak di masa depan", () => {
  const current: OfficialPeriod[] = [{ id: "p1", name: "A", from: "2023-01-01", to: null }]
  expect(validateSuccession(current, "2023-01-01", "2026-11-11")).toBeDefined()
  expect(validateSuccession(current, "2026-11-12", "2026-11-11")).toBeDefined()
  expect(validateSuccession(current, "2026-13-40", "2026-11-11")).toBeDefined()
  expect(validateSuccession(current, "2026-11-11", "2026-11-11")).toBeUndefined()
})

const user = (role: User["role"], faculty: User["faculty"]): User => ({ id: "u", name: "u", role, faculty, actorId: "u" })

test("wewenang ubah", () => {
  expect(canEditOffice(user("admin", "FMIPA"), "REKTOR")).toBe(true)
  expect(canEditOffice(user("admin", "FMIPA"), "FMIPA")).toBe(true)
  expect(canEditOffice(user("admin", "FMIPA"), "FT")).toBe(false)
  expect(canEditOffice(user("dekan", "FMIPA"), "FMIPA")).toBe(false)
  expect(canEditOffice(user("rektor", null), "REKTOR")).toBe(false)
})

test("label jabatan dan data awal", () => {
  expect(OFFICE_LABEL("REKTOR")).toBe("Rektor")
  expect(OFFICE_LABEL("FMIPA")).toBe("Dekan FMIPA")
  expect(INITIAL_OFFICIALS).toHaveLength(9)
  expect(INITIAL_OFFICIALS[0]).toEqual({ office: "REKTOR", name: "Prof. Dr. Ir. Lusmeilia Afriani, D.E.A., IPM., ASEAN Eng." })
  expect(INITIAL_OFFICIALS.find((o) => o.office === "FMIPA")?.name).toBe("Dr. Eng. Heri Satria, S.Si., M.Si.")
})
