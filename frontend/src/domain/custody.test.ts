import type { HistoryAction, HistoryEntry, RecordStatus } from "@/api/types"
import { custody } from "./custody"

const entry = (action: HistoryAction, kind: HistoryEntry["kind"] = "ledger"): HistoryEntry => ({
  kind,
  action,
  at: "2026-11-01T02:00:00.000Z",
  actor: "dekan-fmipa@UnilaMSP",
  txId: kind === "ledger" ? "a".repeat(64) : null,
  note: null,
  changes: [],
})

const states = (status: RecordStatus, history: HistoryEntry[] = []) => custody(status, history).map((s) => s.state)

test("menunggu dekan", () => {
  const stages = custody("MENUNGGU_DEKAN", [entry("DIAJUKAN", "offchain")])
  expect(stages.map((s) => s.state)).toEqual(["done", "current", "pending", "pending"])
  expect(stages.map((s) => s.key)).toEqual(["admin", "dekan", "rektor", "ledger"])
  expect(stages[0].stateLabel).toBe("Diajukan")
  expect(stages[0].event?.action).toBe("DIAJUKAN")
})

test("ditolak dekan", () => {
  const h = [entry("DIAJUKAN", "offchain"), entry("DITOLAK_DEKAN", "offchain")]
  const stages = custody("DITOLAK_DEKAN", h)
  expect(stages.map((s) => s.state)).toEqual(["done", "rejected", "pending", "pending"])
  expect(stages[1].event?.action).toBe("DITOLAK_DEKAN")
})

test("menunggu rektor memuat event SahkanDekan", () => {
  const h = [entry("DIAJUKAN", "offchain"), entry("SahkanDekan")]
  const stages = custody("MENUNGGU_REKTOR", h)
  expect(stages.map((s) => s.state)).toEqual(["done", "done", "current", "pending"])
  expect(stages[1].event?.action).toBe("SahkanDekan")
})

test("aktif, ditolak rektor, dicabut", () => {
  expect(states("AKTIF")).toEqual(["done", "done", "done", "done"])
  expect(states("DITOLAK_REKTOR")).toEqual(["done", "done", "rejected", "pending"])
  const h = [entry("DIAJUKAN", "offchain"), entry("SahkanDekan"), entry("SahkanRektor"), entry("CabutSKPI")]
  const stages = custody("DICABUT", h)
  expect(stages.map((s) => s.state)).toEqual(["done", "done", "done", "revoked"])
  expect(stages[3].event?.action).toBe("CabutSKPI")
  expect(stages[2].event?.action).toBe("SahkanRektor")
})

test("catat ulang setelah dicabut memakai event pengajuan terbaru", () => {
  const h = [entry("DIAJUKAN", "offchain"), entry("SahkanDekan"), entry("CabutSKPI"), { ...entry("DIAJUKAN", "offchain"), at: "2026-11-05T00:00:00.000Z" }]
  const stages = custody("MENUNGGU_DEKAN", h)
  expect(stages[0].event?.at).toBe("2026-11-05T00:00:00.000Z")
  expect(stages[1].event).toBeUndefined()
})
