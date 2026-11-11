/*
 * Uji kontrak: klien HTTP production frontend (frontend/src/api/httpClient.ts) berbicara ke backend sungguhan
 * lewat HTTP, dengan cookie jar sederhana. Skenario frontend/src/api/mock/mockClient.test.ts diporting di atasnya.
 */
import type { AddressInfo } from "node:net"
import type { Server } from "node:http"
import { createHttpClient } from "../../../frontend/src/api/httpClient"
import { ApiError } from "../../../frontend/src/api/errors"
import type { ApiClient } from "../../../frontend/src/api/client"
import { FakeLedger } from "./fakeLedger.js"
import { DEMO_PASSWORD, buildTestApp } from "./app.js"

export { ApiError }

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))))
})

export async function startContract(opts: { ledger?: FakeLedger; now?: () => Date } = {}) {
  const ledger = opts.ledger ?? new FakeLedger(opts.now)
  const { app, pool } = await buildTestApp({ ledger, now: opts.now })
  const server = app.listen(0, "127.0.0.1")
  servers.push(server)
  await new Promise<void>((r) => server.once("listening", () => r()))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`

  const jar = new Map<string, string>()
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const headers = new Headers(init.headers)
    if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "))
    const res = await fetch(input, { ...init, headers })
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";")
      const [k, v] = pair.split("=")
      const expired = attrs.some((a) => /^\s*expires=Thu, 01 Jan 1970/i.test(a)) || !v
      if (expired) jar.delete(k.trim())
      else jar.set(k.trim(), v)
    }
    return res
  }
  const client: ApiClient = createHttpClient(base, fetchImpl)

  async function loginAs(email: string) {
    await client.logout()
    return client.login({ identifier: email, password: DEMO_PASSWORD })
  }

  return { client, ledger, pool, loginAs, base, fetchImpl }
}

export async function expectApiError(p: Promise<unknown>, status: number): Promise<ApiError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  if (!(err instanceof ApiError)) throw new Error(`diharapkan ApiError ${status}, didapat ${String(err)}`)
  if (err.status !== status) throw new Error(`diharapkan status ${status}, didapat ${err.status}: ${err.message}`)
  return err
}
