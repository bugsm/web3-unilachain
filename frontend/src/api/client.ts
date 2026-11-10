import type {
  ActivityItem,
  BatchResult,
  Draft,
  LoginInput,
  NewDraft,
  QueueItem,
  RecordDetail,
  RecordFilter,
  SkpiData,
  SkpiInput,
  SkpiRecord,
  User,
  VerifyCandidate,
  VerifyResult,
} from "./types"

/** Satu-satunya pintu layar ke backend. Implementasi: mock (dev/test) dan http (production). */
export interface ApiClient {
  login(input: LoginInput): Promise<User>
  me(): Promise<User | null>
  logout(): Promise<void>

  listRecords(filter?: { status?: RecordFilter; q?: string }): Promise<SkpiRecord[]>
  getRecord(npm: string): Promise<RecordDetail>
  activity(limit: number): Promise<ActivityItem[]>
  listQueue(): Promise<QueueItem[]>

  createDraft(input: NewDraft): Promise<Draft>
  createDrafts(items: SkpiInput[]): Promise<BatchResult>
  updateDraft(id: string, data: SkpiData): Promise<Draft>
  approveDraft(id: string): Promise<{ txId: string }>
  rejectDraft(id: string, reason: string): Promise<Draft>
  rektorApprove(npm: string): Promise<{ txId: string }>
  rektorReject(npm: string, reason: string): Promise<{ txId: string }>

  searchPublic(q: string): Promise<{ candidates: VerifyCandidate[]; truncated: boolean }>
  verify(npm: string): Promise<VerifyResult>
  ledgerInfo(): Promise<{ channel: string; msp: string }>
}
