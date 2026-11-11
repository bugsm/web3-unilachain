import {
  normalizeNpm,
  predicateOf,
  predicateRange,
  toForm,
  toInput,
  validateReason,
  validateSkpi,
  type SkpiForm,
} from "./skpi"

const valid: SkpiForm = {
  npm: "2317051001",
  name: "Nabila Azzahra",
  skpiId: "001/UN26.17/SKPI/2026",
  programStudy: "S1 Ilmu Komputer",
  totalSKP: "236",
}

describe("predicateOf mengikuti tabel chaincode", () => {
  test.each([
    [226, "Unggul"],
    [225, "Sangat Baik"],
    [151, "Sangat Baik"],
    [150, "Baik"],
    [76, "Baik"],
    [75, "Cukup"],
    [25, "Cukup"],
  ])("%i → %s", (total, label) => {
    expect(predicateOf(total)).toBe(label)
  })

  test("di bawah 25 tidak memenuhi syarat", () => {
    expect(predicateOf(24)).toBeNull()
  })

  test("rentang predikat", () => {
    expect(predicateRange("Unggul")).toBe("> 225")
    expect(predicateRange("Cukup")).toBe("25–75")
  })
})

describe("validateSkpi", () => {
  test("form FMIPA yang valid tidak punya galat", () => {
    expect(validateSkpi(valid, "FMIPA")).toEqual({})
  })

  test("NPM fakultas lain ditolak", () => {
    expect(validateSkpi({ ...valid, npm: "2315051001" }, "FMIPA").npm).toContain(
      "bukan mahasiswa FMIPA",
    )
  })

  test("NPM harus 10 digit", () => {
    expect(validateSkpi({ ...valid, npm: "23170510" }, "FMIPA").npm).toContain("10 digit")
  })

  test("NPM dengan spasi dinormalisasi", () => {
    expect(validateSkpi({ ...valid, npm: " 2317 051 001 " }, "FMIPA")).toEqual({})
    expect(normalizeNpm(" 2317 051 001 ")).toBe("2317051001")
  })

  test("kode unit nomor SKPI harus milik fakultas", () => {
    expect(
      validateSkpi({ ...valid, skpiId: "001/UN26.15/SKPI/2026" }, "FMIPA").skpiId,
    ).toContain("UN26.17")
  })

  test("format nomor SKPI", () => {
    expect(validateSkpi({ ...valid, skpiId: "1/UN26.17/SKPI/2026" }, "FMIPA").skpiId).toBe(
      "Format nomor SKPI: NNN/UN26.KK/SKPI/YYYY.",
    )
    const long = `${"1".repeat(47)}/UN26.17/SKPI/2026`
    expect(long.length).toBe(65)
    expect(validateSkpi({ ...valid, skpiId: long }, "FMIPA").skpiId).toBeDefined()
  })

  test("total SKP minimal 25 dan bilangan bulat", () => {
    expect(validateSkpi({ ...valid, totalSKP: "24" }, "FMIPA").totalSKP).toContain("minimal 25")
    expect(validateSkpi({ ...valid, totalSKP: "25.5" }, "FMIPA").totalSKP).toBe(
      "Total SKP harus bilangan bulat.",
    )
  })

  test("nama: karakter kontrol dan panjang", () => {
    expect(validateSkpi({ ...valid, name: "Budi\u0007" }, "FMIPA").name).toBeDefined()
    expect(validateSkpi({ ...valid, name: "a".repeat(101) }, "FMIPA").name).toBeDefined()
    expect(validateSkpi({ ...valid, name: "   " }, "FMIPA").name).toBeDefined()
  })

  test("program studi harus milik fakultas", () => {
    expect(
      validateSkpi({ ...valid, programStudy: "S1 Teknik Sipil" }, "FMIPA").programStudy,
    ).toBe("Program studi tidak ada di fakultas ini.")
  })
})

test("toInput merapikan nilai, toForm kebalikannya", () => {
  const input = toInput({ ...valid, npm: " 2317 051001", name: "  Nabila   Azzahra " })
  expect(input).toEqual({
    npm: "2317051001",
    name: "Nabila Azzahra",
    skpiId: "001/UN26.17/SKPI/2026",
    programStudy: "S1 Ilmu Komputer",
    totalSKP: 236,
  })
  expect(toForm(input)).toEqual(valid)
})

describe("validateReason", () => {
  test("terlalu pendek", () => {
    expect(validateReason("pendek")).toBe("Alasan minimal 10 karakter.")
  })
  test("terlalu panjang", () => {
    expect(validateReason("a".repeat(501))).toBe("Alasan maksimal 500 karakter.")
  })
  test("cukup", () => {
    expect(validateReason("1234567890")).toBeUndefined()
  })
})

describe("alasan multi-baris (chaincode menolak karakter kontrol)", () => {
  test("normalizeReason meratakan baris dan spasi", async () => {
    const { normalizeReason } = await import("./skpi")
    expect(normalizeReason(" Baris satu\n\n  baris\tdua ")).toBe("Baris satu baris dua")
  })
})
