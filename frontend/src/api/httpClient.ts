import type { ApiClient } from "./client"
import { ApiError } from "./errors"

const CODE_BY_STATUS: Record<number, string> = {
  400: "VALIDATION",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
  502: "UNAVAILABLE",
  503: "UNAVAILABLE",
}

/** Klien production: path relatif /api, sesi lewat cookie httpOnly. */
export function createHttpClient(base = "/api", fetchImpl: typeof fetch = fetch): ApiClient {
  async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    let res: Response
    try {
      res = await fetchImpl(`${base}${path}`, {
        method: init.method ?? "GET",
        credentials: "include",
        headers: init.body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      })
    } catch {
      throw new ApiError(0, "NETWORK", "Layanan tidak dapat dihubungi.")
    }
    if (res.status === 204) return undefined as T
    const payload: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const error = (payload as { error?: { code?: string; message?: string } } | null)?.error
      throw new ApiError(
        res.status,
        error?.code ?? CODE_BY_STATUS[res.status] ?? "ERROR",
        error?.message ?? res.statusText ?? "Terjadi kesalahan.",
      )
    }
    return payload as T
  }
  const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: "POST", body })
  const enc = encodeURIComponent

  return {
    login: (input) => post("/auth/login", input),
    async me() {
      try {
        return await request("/auth/me")
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    async logout() {
      await post("/auth/logout")
    },
    listRecords(filter = {}) {
      const qs = new URLSearchParams()
      if (filter.status && filter.status !== "ALL") qs.set("status", filter.status)
      if (filter.q) qs.set("q", filter.q)
      const s = qs.toString()
      return request(`/records${s ? `?${s}` : ""}`)
    },
    getRecord: (npm) => request(`/records/${enc(npm)}`),
    activity: (limit) => request(`/activity?limit=${limit}`),
    listQueue: () => request("/queue"),
    createDraft: (input) => post("/drafts", input),
    createDrafts: (items) => post("/drafts/batch", { items }),
    updateDraft: (id, data) => request(`/drafts/${enc(id)}`, { method: "PUT", body: data }),
    approveDraft: (id) => post(`/drafts/${enc(id)}/approve`),
    rejectDraft: (id, reason) => post(`/drafts/${enc(id)}/reject`, { reason }),
    rektorApprove: (npm) => post(`/records/${enc(npm)}/rektor/approve`),
    rektorReject: (npm, reason) => post(`/records/${enc(npm)}/rektor/reject`, { reason }),
    searchPublic: (q) => request(`/verify?q=${enc(q)}`),
    verify: (npm) => request(`/verify/${enc(npm)}`),
    ledgerInfo: () => request("/ledger/info"),
  }
}
