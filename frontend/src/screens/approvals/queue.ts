import type { ApiClient } from "@/api/client"
import type { QueueItem, SkpiData } from "@/api/types"

export const keyOf = (q: QueueItem) => (q.kind === "draft" ? q.draft.id : q.record.npm)
export const npmOf = (q: QueueItem) => (q.kind === "draft" ? q.draft.npm : q.record.npm)

/** Data yang ditampilkan: data usulan untuk pencatatan/perubahan, data aset untuk lainnya. */
export function dataOf(q: QueueItem): SkpiData & { npm: string } {
  if (q.kind === "draft" && q.draft.type === "PENCATATAN" && q.draft.data) return { npm: q.draft.npm, ...q.draft.data }
  const r = q.record!
  return { npm: r.npm, name: r.name, skpiId: r.skpiId, programStudy: r.programStudy, totalSKP: r.totalSKP }
}

export const sinceOf = (q: QueueItem) => (q.kind === "draft" ? q.draft.updatedAt : q.record.lastActivityAt)

export const CHAINCODE_FN = {
  PENCATATAN: "SahkanDekan",
  PERUBAHAN: "PerbaruiSKPI",
  PENCABUTAN: "CabutSKPI",
} as const

export const approveLabel = (q: QueueItem) =>
  q.kind === "rektor" ? "Sahkan (SahkanRektor)" : `Setujui (${CHAINCODE_FN[q.draft.type]})`

export function approvedMessage(q: QueueItem) {
  if (q.kind === "rektor") return "SKPI disahkan · kini aktif di ledger"
  if (q.draft.type === "PERUBAHAN") return "Perubahan disahkan · data ledger diperbarui"
  if (q.draft.type === "PENCABUTAN") return "SKPI dicabut · status publik diperbarui"
  return "SKPI disahkan · diteruskan ke Rektor"
}

export const rejectedMessage = (q: QueueItem) =>
  q.kind === "rektor" ? "SKPI ditolak Rektor · tercatat di ledger" : "Draft ditolak · dikembalikan ke admin fakultas"

export const approve = (api: ApiClient, q: QueueItem) =>
  q.kind === "draft" ? api.approveDraft(q.draft.id) : api.rektorApprove(q.record.npm)

export const reject = (api: ApiClient, q: QueueItem, reason: string) =>
  q.kind === "draft" ? api.rejectDraft(q.draft.id, reason) : api.rektorReject(q.record.npm, reason)
