import { ApiError, userMessage } from "./errors"
import { createHttpClient } from "./httpClient"

function json(status: number, body: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function setup(res: Response | Error) {
  const fetchImpl = vi.fn(async () => {
    if (res instanceof Error) throw res
    return res
  })
  return { fetchImpl, client: createHttpClient("/api", fetchImpl as unknown as typeof fetch) }
}

const call = (f: ReturnType<typeof vi.fn>, i = 0) => f.mock.calls[i] as unknown as [string, RequestInit]

test("verify memanggil GET /api/verify/:npm dengan cookie", async () => {
  const { fetchImpl, client } = setup(json(200, { status: "TIDAK_TERDAFTAR", data: null, rektorName: null }))
  await client.verify("2317051001")
  const [url, init] = call(fetchImpl)
  expect(url).toBe("/api/verify/2317051001")
  expect(init.method ?? "GET").toBe("GET")
  expect(init.credentials).toBe("include")
})

test("searchPublic meng-encode kueri", async () => {
  const { fetchImpl, client } = setup(json(200, { candidates: [], truncated: false }))
  await client.searchPublic("Budi Santoso")
  expect(call(fetchImpl)[0]).toBe("/api/verify?q=Budi%20Santoso")
})

test("approveDraft dan rektorReject memakai POST dengan body JSON", async () => {
  const { fetchImpl, client } = setup(json(200, { txId: "a".repeat(64) }))
  await client.approveDraft("d1")
  expect(call(fetchImpl)[0]).toBe("/api/drafts/d1/approve")
  expect(call(fetchImpl)[1].method).toBe("POST")

  fetchImpl.mockResolvedValueOnce(json(200, { txId: "b".repeat(64) }))
  await client.rektorReject("2317051001", "alasan penolakan")
  const [url, init] = call(fetchImpl, 1)
  expect(url).toBe("/api/records/2317051001/rektor/reject")
  expect(init.method).toBe("POST")
  expect(init.body).toBe(JSON.stringify({ reason: "alasan penolakan" }))
  expect(new Headers(init.headers).get("Content-Type")).toBe("application/json")
})

test("listRecords meneruskan filter", async () => {
  const { fetchImpl, client } = setup(json(200, []))
  await client.listRecords({ status: "AKTIF", q: "budi" })
  expect(call(fetchImpl)[0]).toBe("/api/records?status=AKTIF&q=budi")
})

test("galat 409 dari server menjadi ApiError", async () => {
  const { client } = setup(json(409, { error: { code: "CONFLICT", message: "NPM sudah memiliki draft" } }))
  const err = await client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "x".repeat(10) }).catch((e) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect(err).toMatchObject({ status: 409, code: "CONFLICT", message: "NPM sudah memiliki draft" })
})

test("503 tanpa body JSON", async () => {
  const { client } = setup(new Response("Bad Gateway", { status: 503 }))
  const err = await client.verify("2317051001").catch((e) => e)
  expect(err).toMatchObject({ status: 503, code: "UNAVAILABLE" })
})

test("jaringan putus → status 0", async () => {
  const { client } = setup(new TypeError("Failed to fetch"))
  const err = await client.verify("2317051001").catch((e) => e)
  expect(err).toMatchObject({ status: 0, code: "NETWORK" })
  expect(userMessage(err)).toBe("Layanan ledger sedang tidak terjangkau.")
})

test("me() mengembalikan null bila 401", async () => {
  const { client } = setup(json(401, { error: { code: "UNAUTHENTICATED", message: "Sesi berakhir" } }))
  expect(await client.me()).toBeNull()
})

test("logout menerima 204", async () => {
  const { fetchImpl, client } = setup(new Response(null, { status: 204 }))
  await expect(client.logout()).resolves.toBeUndefined()
  expect(call(fetchImpl)[0]).toBe("/api/auth/logout")
})

describe("bentuk respons dan body mengikuti spec §6", () => {
  const user = { id: "u1", name: "Dekan FMIPA", role: "dekan", faculty: "FMIPA", actorId: "dekan-fmipa@UnilaMSP" }
  const draft = { id: "d1", type: "PENCATATAN", status: "MENUNGGU_DEKAN", npm: "2317051001" }

  test("login dan me membuka {user}", async () => {
    const { client, fetchImpl } = setup(json(200, { user }))
    expect(await client.login({ identifier: "a@unila.ac.id", password: "x".repeat(8) })).toEqual(user)
    expect(JSON.parse(call(fetchImpl)[1].body as string)).toEqual({ identifier: "a@unila.ac.id", password: "x".repeat(8) })
    fetchImpl.mockResolvedValueOnce(json(200, { user }))
    expect(await client.me()).toEqual(user)
  })

  test("createDraft mengirim body datar dan membuka {draft}", async () => {
    const { client, fetchImpl } = setup(json(201, { draft }))
    const res = await client.createDraft({
      type: "PENCATATAN",
      npm: "2317051001",
      data: { name: "Nabila", skpiId: "001/UN26.17/SKPI/2026", programStudy: "S1 Ilmu Komputer", totalSKP: 180 },
    })
    expect(res).toEqual(draft)
    expect(JSON.parse(call(fetchImpl)[1].body as string)).toEqual({
      type: "PENCATATAN",
      npm: "2317051001",
      name: "Nabila",
      skpiId: "001/UN26.17/SKPI/2026",
      programStudy: "S1 Ilmu Komputer",
      totalSKP: 180,
    })
  })

  test("pencabutan: body datar berisi reason", async () => {
    const { client, fetchImpl } = setup(json(201, { draft }))
    await client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" })
    expect(JSON.parse(call(fetchImpl)[1].body as string)).toEqual({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" })
  })

  test("rejectDraft dan updateDraft membuka {draft}", async () => {
    const { client, fetchImpl } = setup(json(200, { draft }))
    expect(await client.rejectDraft("d1", "alasan yang cukup")).toEqual(draft)
    fetchImpl.mockResolvedValueOnce(json(200, { draft }))
    expect(await client.updateDraft("d1", { name: "N", skpiId: "001/UN26.17/SKPI/2026", programStudy: "S1 Ilmu Komputer", totalSKP: 30 })).toEqual(draft)
  })

  test("searchPublic: truncated bawaan false bila server tidak mengirimnya", async () => {
    const { client } = setup(json(200, { candidates: [] }))
    expect(await client.searchPublic("budi")).toEqual({ candidates: [], truncated: false })
  })
})

test("endpoint pejabat", async () => {
  const official = { office: "REKTOR", periods: [], lastChange: null }
  const { client, fetchImpl } = setup(json(200, [official]))
  await client.listOfficials()
  expect(call(fetchImpl)[0]).toBe("/api/officials")
  fetchImpl.mockResolvedValueOnce(json(200, []))
  await client.officialChanges("FMIPA")
  expect(call(fetchImpl, 1)[0]).toBe("/api/officials/changes?office=FMIPA")
  fetchImpl.mockResolvedValueOnce(json(200, official))
  await client.correctOfficial("REKTOR", "p1", "Nama Baru")
  expect(call(fetchImpl, 2)[0]).toBe("/api/officials/REKTOR/corrections")
  expect(JSON.parse(call(fetchImpl, 2)[1].body as string)).toEqual({ periodId: "p1", name: "Nama Baru" })
  fetchImpl.mockResolvedValueOnce(json(200, official))
  await client.replaceOfficial("FMIPA", "Nama Baru", "2026-11-01")
  expect(call(fetchImpl, 3)[0]).toBe("/api/officials/FMIPA/successions")
  expect(JSON.parse(call(fetchImpl, 3)[1].body as string)).toEqual({ name: "Nama Baru", from: "2026-11-01" })
})
