import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { LedgerInfo } from "@/api/types"
import { useApi } from "./ApiProvider"

export const POLL_MS = 15_000

export type ChainState = "checking" | "online" | "offline"

export interface ChainStatusValue {
  state: ChainState
  /** Jawaban sukses terakhir; tetap ada saat terputus untuk "blok terakhir diketahui". */
  info: LedgerInfo | null
  /** Nomor blok terbaru (height - 1; genesis = 0). */
  latestBlock: number | null
  /** Waktu jawaban terakhir (sukses atau gagal) di sisi klien. */
  lastCheck: Date | null
  refresh(): void
}

const ChainContext = createContext<ChainStatusValue | null>(null)

/**
 * Satu poller untuk seluruh aplikasi: `/ledger/info` tiap 15 detik, berhenti saat tab tersembunyi,
 * langsung memeriksa ulang saat tab terlihat kembali.
 */
export function ChainStatusProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const [state, setState] = useState<ChainState>("checking")
  const [info, setInfo] = useState<LedgerInfo | null>(null)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const inflight = useRef(false)

  const refresh = useCallback(() => {
    if (inflight.current) return
    inflight.current = true
    api.ledgerInfo().then(
      (i) => {
        inflight.current = false
        setInfo(i)
        setState("online")
        setLastCheck(new Date())
      },
      () => {
        inflight.current = false
        setState("offline")
        setLastCheck(new Date())
      },
    )
  }, [api])

  useEffect(() => {
    refresh()
    const timer = setInterval(() => {
      if (!document.hidden) refresh()
    }, POLL_MS)
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  const value = useMemo<ChainStatusValue>(
    () => ({ state, info, latestBlock: info ? Math.max(0, info.height - 1) : null, lastCheck, refresh }),
    [state, info, lastCheck, refresh],
  )
  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
}

export function useChainStatus(): ChainStatusValue {
  const v = useContext(ChainContext)
  if (!v) throw new Error("useChainStatus harus dipakai di dalam ChainStatusProvider")
  return v
}
