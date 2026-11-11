import { useCallback, useEffect, useState, type DependencyList } from "react"

export interface AsyncState<T> {
  data: T | undefined
  error: unknown
  loading: boolean
  reload: () => void
}

/** Muat data saat dependensi berubah; hasil lama dipertahankan selama memuat ulang. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean }>({
    data: undefined,
    error: undefined,
    loading: true,
  })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: undefined }))
    fn().then(
      (data) => alive && setState({ data, error: undefined, loading: false }),
      (error: unknown) => alive && setState((s) => ({ ...s, error, loading: false })),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}
