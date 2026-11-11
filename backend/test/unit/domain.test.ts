import { expect } from "chai"
import { facultyOfNpm, issuerLabel } from "../../src/domain/faculty.js"
import { nameAt, validateSuccession } from "../../src/domain/officials.js"
import { predicateOf, validateReason, validateSkpi } from "../../src/domain/skpi.js"

const form = { npm: "2017051008", name: "Nabila Azzahra", skpiId: "001/UN26.17/SKPI/2026", programStudy: "S1 Ilmu Komputer", totalSKP: "180" }

describe("domain", () => {
  it("predikat mengikuti tabel chaincode", () => {
    expect(predicateOf(226)).to.equal("Unggul")
    expect(predicateOf(225)).to.equal("Sangat Baik")
    expect(predicateOf(151)).to.equal("Sangat Baik")
    expect(predicateOf(76)).to.equal("Baik")
    expect(predicateOf(25)).to.equal("Cukup")
    expect(predicateOf(24)).to.equal(null)
  })

  it("fakultas dari digit ke-4 NPM dan label penerbit", () => {
    expect(facultyOfNpm("2017051008")).to.equal("FMIPA")
    expect(facultyOfNpm("2015061003")).to.equal("FT")
    expect(issuerLabel("FMIPA")).to.equal("Dekan Fakultas Matematika dan Ilmu Pengetahuan Alam")
  })

  it("validasi SKPI menolak kode unit fakultas lain", () => {
    expect(validateSkpi(form, "FMIPA")).to.deep.equal({})
    expect(validateSkpi({ ...form, skpiId: "001/UN26.15/SKPI/2026" }, "FMIPA").skpiId).to.equal("Kode unit harus UN26.17 untuk FMIPA.")
    expect(validateSkpi({ ...form, totalSKP: "24" }, "FMIPA").totalSKP).to.equal("Total SKP minimal 25.")
  })

  it("alasan minimal 10 karakter", () => {
    expect(validateReason("singkat")).to.equal("Alasan minimal 10 karakter.")
    expect(validateReason("Data program studi salah ketik")).to.equal(undefined)
  })

  it("nama pejabat dipilih berdasarkan hari WIB, termasuk lewat tengah malam", () => {
    const periods = [
      { id: "a", name: "Lama", from: "2023-01-01", to: "2026-10-14" },
      { id: "b", name: "Baru", from: "2026-10-15", to: null },
    ]
    // 2026-10-14T17:30Z = 15 Okt 00.30 WIB
    expect(nameAt(periods, "2026-10-14T17:30:00.000Z")).to.equal("Baru")
    expect(nameAt(periods, "2026-10-14T16:30:00.000Z")).to.equal("Lama")
    expect(validateSuccession(periods, "2026-10-15", "2026-11-12")).to.be.a("string")
  })
})
