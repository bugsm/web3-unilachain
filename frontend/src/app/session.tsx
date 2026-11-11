import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { ApiClient } from "@/api/client"
import { ApiError } from "@/api/errors"
import type { LoginInput, User } from "@/api/types"
import { ApiProvider } from "./ApiProvider"

interface Session {
  user: User | null
  loading: boolean
  login(input: LoginInput): Promise<User>
  logout(): Promise<void>
}

const SessionContext = createContext<Session | null>(null)

/** Bungkus klien: setiap 401 mengosongkan sesi sehingga guard rute mengarahkan ke /masuk. */
function withUnauthorized(client: ApiClient, onUnauthorized: () => void): ApiClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== "function" || prop === "login") return value
      return (...args: unknown[]) =>
        (value as (...a: unknown[]) => Promise<unknown>).apply(target, args).catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 401) onUnauthorized()
          throw e
        })
    },
  })
}

export function SessionProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const guarded = useMemo(() => withUnauthorized(client, () => setUser(null)), [client])

  useEffect(() => {
    let alive = true
    client
      .me()
      .then((u) => alive && setUser(u))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [client])

  const login = useCallback(
    async (input: LoginInput) => {
      const u = await client.login(input)
      setUser(u)
      return u
    },
    [client],
  )
  const logout = useCallback(async () => {
    await client.logout().catch(() => undefined)
    setUser(null)
  }, [client])

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout])
  return (
    <SessionContext.Provider value={value}>
      <ApiProvider client={guarded}>{children}</ApiProvider>
    </SessionContext.Provider>
  )
}

export function useSession(): Session {
  const s = useContext(SessionContext)
  if (!s) throw new Error("useSession harus dipakai di dalam SessionProvider")
  return s
}

/** Untuk layar staf: sesi pasti ada (dijamin guard rute). */
export function useUser(): User {
  const { user } = useSession()
  if (!user) throw new Error("Tidak ada sesi")
  return user
}
