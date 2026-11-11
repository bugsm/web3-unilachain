import { compactStamp, formatDate, formatDateTime, shortHash } from "./format"

test("waktu ditampilkan dalam WIB", () => {
  const s = formatDateTime("2026-06-18T02:00:00Z")
  expect(s).toContain("09.00")
  expect(s.endsWith("WIB")).toBe(true)
})

test("tanggal saja", () => {
  expect(formatDate("2026-06-18T20:00:00Z")).toContain("19")
})

test("hash dipendekkan", () => {
  expect(shortHash("a".repeat(8) + "b".repeat(50) + "c".repeat(6))).toBe("aaaaaaaa…cccccc")
})

test("cap waktu ringkas dalam WIB (UTC+7), termasuk lewat tengah malam", () => {
  expect(compactStamp("2026-11-11T15:31:00.000Z")).toBe("202611112231")
  expect(compactStamp("2026-12-31T17:05:00.000Z")).toBe("202701010005")
})
