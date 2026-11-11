/* Tabel periode jabatan pejabat penanda tangan (off-chain) beserta log perubahannya. */
import {
  INITIAL_FROM,
  INITIAL_OFFICIALS,
  dayBefore,
  nameAt,
  normalizeOfficialName,
  validateOfficialName,
  validateSuccession,
} from "@/domain/officials"
import { ApiError } from "../errors"
import type { Office, Official, OfficialChange, OfficialPeriod } from "../types"

export interface OfficialsStore {
  periods: Map<Office, OfficialPeriod[]>
  changes: OfficialChange[]
  seq: number
}

export function createOfficialsStore(): OfficialsStore {
  const s: OfficialsStore = { periods: new Map(), changes: [], seq: 0 }
  for (const o of INITIAL_OFFICIALS) s.periods.set(o.office, [{ id: `op${++s.seq}`, name: o.name, from: INITIAL_FROM, to: null }])
  return s
}

const periodsOf = (s: OfficialsStore, office: Office) => {
  const p = s.periods.get(office)
  if (!p) throw new ApiError(404, "NOT_FOUND", `Jabatan ${office} tidak dikenal.`)
  return p
}

export function officialOf(s: OfficialsStore, office: Office): Official {
  const changes = s.changes.filter((c) => c.office === office)
  return { office, periods: periodsOf(s, office), lastChange: changes[changes.length - 1] ?? null }
}

export const listOfficials = (s: OfficialsStore) => [...s.periods.keys()].map((o) => officialOf(s, o))

export const changesOf = (s: OfficialsStore, office: Office) => s.changes.filter((c) => c.office === office).reverse()

function assertName(name: string) {
  const err = validateOfficialName(name)
  if (err) throw new ApiError(400, "VALIDATION", err)
  return normalizeOfficialName(name)
}

function log(s: OfficialsStore, c: Omit<OfficialChange, "id">) {
  s.changes.push({ id: `oc${++s.seq}`, ...c })
}

export function correct(s: OfficialsStore, office: Office, periodId: string, name: string, by: string, at: string): Official {
  const clean = assertName(name)
  const period = periodsOf(s, office).find((p) => p.id === periodId)
  if (!period) throw new ApiError(404, "NOT_FOUND", "Periode jabatan tidak ditemukan.")
  // Simpan tanpa perubahan tidak boleh menggeser "terakhir diubah oleh".
  if (clean === period.name) throw new ApiError(400, "VALIDATION", "Nama tidak berubah.")
  log(s, { office, kind: "KOREKSI", before: period.name, after: clean, by, at })
  period.name = clean
  return officialOf(s, office)
}

export function replace(s: OfficialsStore, office: Office, name: string, from: string, by: string, at: string, today: string): Official {
  const clean = assertName(name)
  const periods = periodsOf(s, office)
  const err = validateSuccession(periods, from, today)
  if (err) throw new ApiError(409, "CONFLICT", err)
  const current = periods[periods.length - 1]
  current.to = dayBefore(from)
  periods.push({ id: `op${++s.seq}`, name: clean, from, to: null })
  log(s, { office, kind: "PERGANTIAN", before: current.name, after: clean, by, at })
  return officialOf(s, office)
}

export const nameOf = (s: OfficialsStore, office: Office, iso: string) => nameAt(periodsOf(s, office), iso)
