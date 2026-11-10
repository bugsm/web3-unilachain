import type { ApiClient } from "./client"
import { createHttpClient } from "./httpClient"
import { createMockClient } from "./mock/mockClient"

export type { ApiClient } from "./client"
export { ApiError, userMessage } from "./errors"
export * from "./types"

/** Mode mock hanya untuk dev/test; build production selalu memakai /api. */
export const isMockMode = import.meta.env.DEV && import.meta.env.VITE_API_MODE === "mock"

export function createDefaultClient(): ApiClient {
  return isMockMode ? createMockClient({ latencyMs: 350 }) : createHttpClient()
}
