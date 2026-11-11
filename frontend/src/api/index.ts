import type { ApiClient } from "./client"
import { createHttpClient } from "./httpClient"
import { createMockClient } from "./mock/mockClient"

export type { ApiClient } from "./client"
export { ApiError, userMessage } from "./errors"
export * from "./types"

/**
 * Mode mock hanya untuk dev/test; build production selalu memakai /api.
 * Kondisi ditulis langsung (bukan konstanta impor) agar Rollup membuang kode mock dari bundle production.
 */
export const isMockMode = import.meta.env.DEV && import.meta.env.VITE_API_MODE === "mock"

let devMock: ReturnType<typeof createMockClient> | undefined

export function createDefaultClient(): ApiClient {
  if (import.meta.env.DEV && import.meta.env.VITE_API_MODE === "mock") {
    // Satu instans (StrictMode memanggil inisialisasi useState dua kali).
    const client = (devMock ??= createMockClient({ latencyMs: 350 }))
    // Demo indikator rantai dari konsol browser: skpiChain(false) = peer terputus, skpiChain(true) = pulih.
    ;(window as unknown as { skpiChain?: (online: boolean) => void }).skpiChain = (online) => client.setChainOnline(online)
    return client
  }
  return createHttpClient()
}
