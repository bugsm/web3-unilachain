/*
 * Penjaga sistem ukuran (lihat DESIGN.md): layar hanya memakai token skala, bukan nilai px lepas.
 * Lembar cetak (VerifyPrint) dikecualikan karena memakai satuan cetak mm/pt.
 */
const sources = import.meta.glob<string>("./**/*.tsx", { query: "?raw", import: "default", eager: true })
const files = Object.entries(sources).filter(([path]) => !path.endsWith(".test.tsx") && !path.endsWith("VerifyPrint.tsx"))

function offenders(pattern: RegExp) {
  return files.flatMap(([path, text]) => [...text.matchAll(pattern)].map((m) => `${path}: ${m[0]}`))
}

test("ada berkas yang diperiksa", () => {
  expect(files.length).toBeGreaterThan(30)
})

test("ukuran teks hanya dari skala (tanpa text-[Npx])", () => {
  expect(offenders(/text-\[\d[^\]]*\]/g)).toEqual([])
})

test("ukuran teks: hanya 12 anak tangga skala yang dipakai", () => {
  const allowed = new Set(["xs", "label", "sm", "body", "base", "lead", "xl", "2xl", "title", "display-sm", "display-md", "display-lg", "display-xl"])
  const sizes = /(?<![\w-])text-(xs|sm|base|lg|xl|[2-9]xl|label|body|lead|title|display-\w+)(?![\w-])/g
  const used = new Set(files.flatMap(([, text]) => [...text.matchAll(sizes)].map((m) => m[1])))
  expect([...used].filter((s) => !allowed.has(s))).toEqual([])
})

test("radius hanya dari skala (md, lg, xl, 2xl, panel, full)", () => {
  expect(offenders(/rounded(?:-[trbl]{1,2})?-\[[^\]]+\]/g)).toEqual([])
  expect(offenders(/(?<![\w-])rounded(?:-[trbl]{1,2})?-(?:none|xs|sm|3xl|4xl)(?![\w-])/g)).toEqual([])
  expect(offenders(/(?<![\w-])rounded(?![\w-])/g)).toEqual([])
})

test("tinggi kontrol dari skala (tanpa h-[Npx], tanpa 36 dan 44)", () => {
  expect(offenders(/(?<![\w-])h-\[\d+px\]/g)).toEqual([])
  expect(offenders(/(?<![\w:-])h-(?:9|11)(?![\w.-])/g)).toEqual([])
})

test("judul memakai gaya display, bukan tracking/leading lepas", () => {
  expect(offenders(/tracking-\[[^\]]+\]/g)).toEqual([])
  expect(offenders(/leading-\[[^\]]+\]/g)).toEqual([])
})

test("bayangan hanya dari token", () => {
  expect(offenders(/shadow-\[[^\]]+\]/g)).toEqual([])
})
