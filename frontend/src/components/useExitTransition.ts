import { useEffect, useState } from "react"

/**
 * Menjaga elemen tetap ter-mount selama transisi keluar.
 * Transisi masuk ditangani CSS `@starting-style` (varian `starting:`), jadi `state` langsung "open".
 */
export function useExitTransition(open: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const t = window.setTimeout(() => setMounted(false), exitMs)
    return () => window.clearTimeout(t)
  }, [open, exitMs])
  return { mounted: open || mounted, state: open ? ("open" as const) : ("closed" as const) }
}
