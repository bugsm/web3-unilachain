import { facultyByCode, type FacultyCode } from "./faculty"
import type { SkpiForm } from "./skpi"

const COLUMNS: Array<keyof SkpiForm> = ["npm", "name", "skpiId", "programStudy", "totalSKP"]
export const CSV_COLUMNS = COLUMNS.join(",")

/** Satu baris CSV dengan dukungan kutip ganda ("" = kutip literal). */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      out.push(cur)
      cur = ""
    } else cur += c
  }
  out.push(cur)
  return out.map((v) => v.trim())
}

/** Pemisah dari baris header: titik koma (Excel lokal Indonesia), tab, atau koma. */
function detectSeparator(header: string): string {
  const counts = [";", "\t", ","].map((s) => [s, header.split(s).length] as const)
  return counts.sort((a, b) => b[1] - a[1])[0][0]
}

export function parseCsv(text: string): SkpiForm[] {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
  if (!lines.length) return []
  const sep = detectSeparator(lines[0])
  const header = splitLine(lines[0], sep).map((h) => h.toLowerCase())
  const index = COLUMNS.map((c) => header.indexOf(c.toLowerCase()))
  if (index.some((i) => i < 0)) throw new Error("Kolom wajib: npm, name, skpiId, programStudy, totalSKP")
  return lines.slice(1).map((line) => {
    const cells = splitLine(line, sep)
    return Object.fromEntries(COLUMNS.map((c, k) => [c, cells[index[k]] ?? ""])) as unknown as SkpiForm
  })
}

/** Templat berisi dua baris contoh yang sah untuk fakultas admin. */
export function csvTemplate(code: FacultyCode): string {
  const f = facultyByCode(code)
  const npm = (n: string) => `231${f.npmDigit}051${n}`
  return [
    CSV_COLUMNS,
    `${npm("901")},Contoh Lulusan Satu,901/${f.unitCode}/SKPI/2026,${f.programs[0]},214`,
    `${npm("902")},Contoh Lulusan Dua,902/${f.unitCode}/SKPI/2026,${f.programs[0]},168`,
  ].join("\n")
}
