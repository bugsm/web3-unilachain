import { csvTemplate, parseCsv } from "./csv"

const row = { npm: "2317051124", name: "Rania Kusuma Dewi", skpiId: "011/UN26.17/SKPI/2026", programStudy: "S1 Ilmu Komputer", totalSKP: "214" }

test("pemisah koma", () => {
  expect(parseCsv("npm,name,skpiId,programStudy,totalSKP\n2317051124,Rania Kusuma Dewi,011/UN26.17/SKPI/2026,S1 Ilmu Komputer,214")).toEqual([row])
})

test("pemisah titik koma dan BOM dari Excel", () => {
  const text = "﻿npm;name;skpiId;programStudy;totalSKP\r\n2317051124;Rania Kusuma Dewi;011/UN26.17/SKPI/2026;S1 Ilmu Komputer;214\r\n"
  expect(parseCsv(text)).toEqual([row])
})

test("baris kosong diabaikan dan kutip berisi koma", () => {
  const text = 'npm,name,skpiId,programStudy,totalSKP\n\n2317051124,"Putri, S.",011/UN26.17/SKPI/2026,S1 Ilmu Komputer,214\n   \n'
  expect(parseCsv(text)).toEqual([{ ...row, name: "Putri, S." }])
})

test("kutip ganda di dalam nilai", () => {
  const text = 'npm,name,skpiId,programStudy,totalSKP\n2317051124,"Rania ""Nia"" Dewi",011/UN26.17/SKPI/2026,S1 Ilmu Komputer,214'
  expect(parseCsv(text)[0].name).toBe('Rania "Nia" Dewi')
})

test("urutan header berbeda tetap dipetakan, tidak peka huruf", () => {
  const text = "TotalSKP,NPM,Name,ProgramStudy,SkpiId\n214,2317051124,Rania Kusuma Dewi,S1 Ilmu Komputer,011/UN26.17/SKPI/2026"
  expect(parseCsv(text)).toEqual([row])
})

test("header tanpa kolom wajib ditolak", () => {
  expect(() => parseCsv("nim,nama\n1,a")).toThrow("Kolom wajib: npm, name, skpiId, programStudy, totalSKP")
})

test("templat per fakultas dapat dibaca ulang", () => {
  const rows = parseCsv(csvTemplate("FT"))
  expect(rows).toHaveLength(2)
  expect(rows[0].skpiId).toContain("UN26.15")
  expect(rows[0].npm[3]).toBe("5")
})
