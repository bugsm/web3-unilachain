import type { ApiClient } from "../client"
import { ApiError } from "../errors"
import type { RecordStatus } from "../types"
import type { SkpiInput } from "@/domain/skpi"
import { createMockClient, DEMO_PASSWORD } from "./mockClient"

async function loginAs(client: ApiClient, email: string) {
  await client.logout()
  return client.login({ identifier: email, password: DEMO_PASSWORD })
}

async function expectApiError(p: Promise<unknown>, status: number) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(ApiError)
  expect((err as ApiError).status).toBe(status)
  return err as ApiError
}

const input = (over: Partial<SkpiInput> = {}): SkpiInput => ({
  npm: "2317051001",
  name: "Nabila Azzahra",
  skpiId: "001/UN26.17/SKPI/2026",
  programStudy: "S1 Ilmu Komputer",
  totalSKP: 180,
  ...over,
})
const data = ({ npm: _n, ...rest }: SkpiInput) => rest

async function submit(client: ApiClient, i: SkpiInput) {
  await loginAs(client, "admin.fmipa@unila.ac.id")
  return client.createDraft({ type: "PENCATATAN", npm: i.npm, data: data(i) })
}

async function activate(client: ApiClient, i: SkpiInput) {
  const d = await submit(client, i)
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  await client.approveDraft(d.id)
  await loginAs(client, "rektor@unila.ac.id")
  await client.rektorApprove(i.npm)
}

let client: ApiClient
beforeEach(() => {
  client = createMockClient({ latencyMs: 0, seed: false })
})

test("1. login: sandi salah 401; peran ditentukan akun, bukan klien", async () => {
  await expectApiError(client.login({ identifier: "admin.fmipa@unila.ac.id", password: "salah-salah" }), 401)
  expect(await client.login({ identifier: " Admin.FMIPA@unila.ac.id ", password: DEMO_PASSWORD })).toMatchObject({ role: "admin" })
  const user = await loginAs(client, "dekan.fmipa@unila.ac.id")
  expect(user).toMatchObject({ role: "dekan", faculty: "FMIPA", actorId: "dekan-fmipa@UnilaMSP" })
  expect(await client.me()).toEqual(user)
})

test("tanpa sesi → 401", async () => {
  await expectApiError(client.listRecords(), 401)
})

test("2. admin mengajukan draft pencatatan fakultasnya", async () => {
  await submit(client, input())
  const records = await client.listRecords()
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ npm: "2317051001", status: "MENUNGGU_DEKAN", predicate: "Sangat Baik" })
  await expectApiError(
    client.createDraft({
      type: "PENCATATAN",
      npm: "2315051001",
      data: data(input({ npm: "2315051001", skpiId: "001/UN26.15/SKPI/2026" })),
    }),
    403,
  )
  await expectApiError(
    client.createDraft({
      type: "PENCATATAN",
      npm: "2317051002",
      data: data(input({ npm: "2317051002", totalSKP: 20 })),
    }),
    400,
  )
})

test("3. dekan menyetujui → transaksi SahkanDekan", async () => {
  await submit(client, input())
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  const queue = await client.listQueue()
  expect(queue).toHaveLength(1)
  const item = queue[0]
  if (item.kind !== "draft") throw new Error("harus draft")
  const { txId } = await client.approveDraft(item.draft.id)
  expect(txId).toMatch(/^[0-9a-f]{64}$/)
  const rec = await client.getRecord("2317051001")
  expect(rec.status).toBe("MENUNGGU_REKTOR")
  expect(rec.issuedTimestamp).toBeTruthy()
  expect(rec.history.map((h) => [h.action, h.kind])).toEqual([
    ["DIAJUKAN", "offchain"],
    ["SahkanDekan", "ledger"],
  ])
  expect(rec.history[1].txId).toBe(txId)
  expect(rec.history[1].actor).toBe("dekan-fmipa@UnilaMSP")
  expect(rec.history[0].txId).toBeNull()
})

test("4. dekan fakultas lain tidak melihat dan tidak bisa menyetujui", async () => {
  const d = await submit(client, input())
  await loginAs(client, "dekan.ft@unila.ac.id")
  expect(await client.listQueue()).toHaveLength(0)
  await expectApiError(client.approveDraft(d.id), 403)
})

test("5. penolakan dekan hanya off-chain dan dapat diajukan ulang", async () => {
  const d = await submit(client, input())
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  await expectApiError(client.rejectDraft(d.id, "pendek"), 400)
  await client.rejectDraft(d.id, "Nomor SKPI tidak sesuai dokumen")
  let rec = await client.getRecord("2317051001")
  expect(rec.status).toBe("DITOLAK_DEKAN")
  expect(rec.reason).toBe("Nomor SKPI tidak sesuai dokumen")
  expect(rec.history.some((h) => h.kind === "ledger")).toBe(false)
  await loginAs(client, "admin.fmipa@unila.ac.id")
  await client.updateDraft(d.id, data(input({ skpiId: "002/UN26.17/SKPI/2026" })))
  rec = await client.getRecord("2317051001")
  expect(rec.status).toBe("MENUNGGU_DEKAN")
  expect(rec.skpiId).toBe("002/UN26.17/SKPI/2026")
})

test("6. rektor mengesahkan atau menolak", async () => {
  await activate(client, input())
  expect((await client.getRecord("2317051001")).status).toBe("AKTIF")

  const other = input({ npm: "2317051002", skpiId: "002/UN26.17/SKPI/2026" })
  const d = await submit(client, other)
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  await client.approveDraft(d.id)
  await loginAs(client, "rektor@unila.ac.id")
  await expectApiError(client.rektorReject(other.npm, "x"), 400)
  await client.rektorReject(other.npm, "Data SKP belum lengkap di lampiran")
  const rec = await client.getRecord(other.npm)
  expect(rec.status).toBe("DITOLAK_REKTOR")
  expect(rec.reason).toBe("Data SKP belum lengkap di lampiran")
  // Nomor SKPI dilepas sehingga boleh dipakai NPM lain.
  await submit(client, input({ npm: "2317051003", skpiId: "002/UN26.17/SKPI/2026" }))
})

test("7. perubahan diajukan admin, disetujui dekan lewat PerbaruiSKPI", async () => {
  await activate(client, input())
  const before = await client.getRecord("2317051001")
  await loginAs(client, "admin.fmipa@unila.ac.id")
  await client.createDraft({ type: "PERUBAHAN", npm: "2317051001", data: data(input({ totalSKP: 230 })) })
  let rec = await client.getRecord("2317051001")
  expect(rec.status).toBe("AKTIF")
  expect(rec.pendingDraft?.type).toBe("PERUBAHAN")
  await expectApiError(
    client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" }),
    409,
  )
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  await client.approveDraft(rec.pendingDraft!.id)
  rec = await client.getRecord("2317051001")
  expect(rec.totalSKP).toBe(230)
  expect(rec.predicate).toBe("Unggul")
  expect(rec.pendingDraft).toBeNull()
  expect(rec.issuedTimestamp).toBe(before.issuedTimestamp)
  const last = rec.history[rec.history.length - 1]
  expect(last.action).toBe("PerbaruiSKPI")
  expect(last.changes).toEqual([{ field: "totalSKP", from: "180", to: "230" }])
})

test("8. pencabutan lalu catat ulang", async () => {
  await activate(client, input())
  await loginAs(client, "admin.fmipa@unila.ac.id")
  const d = await client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" })
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  await client.approveDraft(d.id)
  const rec = await client.getRecord("2317051001")
  expect(rec.status).toBe("DICABUT")
  expect(rec.history[rec.history.length - 1].action).toBe("CabutSKPI")
  const again = await submit(client, input())
  expect(again.status).toBe("MENUNGGU_DEKAN")
})

test("9. nomor SKPI yang dipakai NPM lain ditolak", async () => {
  await activate(client, input())
  await loginAs(client, "admin.fmipa@unila.ac.id")
  await expectApiError(
    client.createDraft({ type: "PENCATATAN", npm: "2317051002", data: data(input({ npm: "2317051002" })) }),
    409,
  )
})

test("10. verifikasi publik hanya memberi data publik", async () => {
  await activate(client, input())
  await client.logout()
  const ok = await client.verify("2317051001")
  expect(ok.status).toBe("TERDAFTAR")
  expect(ok.data).not.toHaveProperty("reason")
  expect(ok.data).not.toHaveProperty("revocationReason")
  expect(ok.data).not.toHaveProperty("dekanId")
  expect(ok.data?.issuer).toBe("Dekan Fakultas Matematika dan Ilmu Pengetahuan Alam")
  expect(ok.rektorName).toBeTruthy()

  const p = input({ npm: "2317051002", skpiId: "002/UN26.17/SKPI/2026" })
  const d = await submit(client, p)
  await client.logout()
  expect(await client.verify(p.npm)).toEqual({ status: "TIDAK_TERDAFTAR", data: null, rektorName: null, dekanName: null })
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  await client.approveDraft(d.id)
  await client.logout()
  expect(await client.verify(p.npm)).toEqual({ status: "BELUM_SAH", data: null, rektorName: null, dekanName: null })

  await loginAs(client, "admin.fmipa@unila.ac.id")
  const c = await client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" })
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  await client.approveDraft(c.id)
  await client.logout()
  const revoked = await client.verify("2317051001")
  expect(revoked.status).toBe("DICABUT")
  expect(JSON.stringify(revoked)).not.toContain("diterbitkan ulang")
  expect(await client.verify("2317059999")).toEqual({ status: "TIDAK_TERDAFTAR", data: null, rektorName: null, dekanName: null })
  await expectApiError(client.verify("12"), 400)
})

test("11. pencarian nama dibatasi 10 hasil", async () => {
  for (let i = 0; i < 12; i++) {
    const n = String(i + 1).padStart(3, "0")
    await activate(client, input({ npm: `2317051${n}`, name: "Budi Santoso", skpiId: `${n}/UN26.17/SKPI/2026` }))
  }
  await submit(client, input({ npm: "2317052001", name: "Budi Draft", skpiId: "500/UN26.17/SKPI/2026" }))
  await client.logout()
  const res = await client.searchPublic("  budi   SANTOSO ")
  expect(res.candidates).toHaveLength(10)
  expect(res.truncated).toBe(true)
  expect(res.candidates[0]).toMatchObject({ name: "Budi Santoso", facultyCode: "FMIPA" })
  expect((await client.searchPublic("budi draft")).candidates).toHaveLength(0)
  await expectApiError(client.searchPublic("bu"), 400)
})

test("12. batch melaporkan galat per baris", async () => {
  await loginAs(client, "admin.fmipa@unila.ac.id")
  const res = await client.createDrafts([input(), input({ skpiId: "002/UN26.17/SKPI/2026" })])
  expect(res.created).toHaveLength(1)
  expect(res.errors).toHaveLength(1)
  expect(res.errors[0]).toMatchObject({ index: 1, npm: "2317051001" })
})

test("seed bawaan mencakup semua status", async () => {
  const seeded = createMockClient({ latencyMs: 0 })
  await loginAs(seeded, "rektor@unila.ac.id")
  const statuses = new Set((await seeded.listRecords()).map((r) => r.status))
  const all: RecordStatus[] = ["MENUNGGU_DEKAN", "DITOLAK_DEKAN", "MENUNGGU_REKTOR", "AKTIF", "DITOLAK_REKTOR", "DICABUT"]
  for (const s of all) expect(statuses).toContain(s)
  await seeded.logout()
  const rizky = await seeded.searchPublic("rizky maulana")
  expect(rizky.candidates.map((c) => c.facultyCode).sort()).toEqual(["FMIPA", "FT"])
  await loginAs(seeded, "admin.ft@unila.ac.id")
  expect((await seeded.listRecords()).every((r) => r.facultyCode === "FT")).toBe(true)
})

test("draft yang ditolak Dekan tidak memblokir draft baru", async () => {
  await activate(client, input())
  await loginAs(client, "admin.fmipa@unila.ac.id")
  const d = await client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Dokumen diterbitkan ulang" })
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  await client.rejectDraft(d.id, "Belum ada surat keputusan pencabutan")
  await loginAs(client, "admin.fmipa@unila.ac.id")
  const again = await client.createDraft({ type: "PENCABUTAN", npm: "2317051001", reason: "Sudah ada surat keputusan pencabutan" })
  const rec = await client.getRecord("2317051001")
  expect(rec.pendingDraft?.id).toBe(again.id)
  expect(rec.pendingDraft?.status).toBe("MENUNGGU_DEKAN")
})

test("draft ditolak yang digantikan draft baru tidak menyandera status maupun nomor SKPI", async () => {
  const d1 = await submit(client, input({ skpiId: "777/UN26.17/SKPI/2026" }))
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  await client.rejectDraft(d1.id, "Nomor SKPI tidak sesuai dokumen")
  const d2 = await submit(client, input({ skpiId: "778/UN26.17/SKPI/2026" }))
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  await client.approveDraft(d2.id)
  const rec = await client.getRecord("2317051001")
  expect(rec.status).toBe("MENUNGGU_REKTOR")
  expect(rec.skpiId).toBe("778/UN26.17/SKPI/2026")
  expect(rec.pendingDraft).toBeNull()
  await loginAs(client, "rektor@unila.ac.id")
  expect((await client.listQueue()).map((q) => q.record?.npm)).toContain("2317051001")
  // Nomor milik draft lama yang digantikan bebas dipakai NPM lain.
  await submit(client, input({ npm: "2317051002", skpiId: "777/UN26.17/SKPI/2026" }))
})

test("mock meniru chaincode: alasan berisi karakter kontrol ditolak", async () => {
  const p = input()
  const d = await submit(client, p)
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  await expectApiError(client.rejectDraft(d.id, "Baris satu\nbaris dua alasan"), 400)
})

describe("pejabat penanda tangan", () => {
  const NOW = () => new Date("2026-11-11T05:00:00Z") // 11 Nov 2026 12.00 WIB
  const LUSMEILIA = "Prof. Dr. Ir. Lusmeilia Afriani, D.E.A., IPM., ASEAN Eng."
  let c: ApiClient
  beforeEach(() => {
    c = createMockClient({ latencyMs: 0, now: NOW })
  })
  const rektor = async () => (await c.listOfficials()).find((o) => o.office === "REKTOR")!

  test("data awal 9 jabatan", async () => {
    await loginAs(c, "dekan.fmipa@unila.ac.id")
    const all = await c.listOfficials()
    expect(all.map((o) => o.office)).toEqual(["REKTOR", "FEB", "FH", "FKIP", "FP", "FT", "FISIP", "FMIPA", "FK"])
    expect(all[0].periods).toEqual([{ id: expect.any(String), name: LUSMEILIA, from: "2023-01-01", to: null }])
    expect(all[0].lastChange).toBeNull()
  })

  test("wewenang: admin lain fakultas 403, dekan/rektor 403", async () => {
    await loginAs(c, "admin.ft@unila.ac.id")
    const fmipa = (await c.listOfficials()).find((o) => o.office === "FMIPA")!
    await expectApiError(c.correctOfficial("FMIPA", fmipa.periods[0].id, "Dr. Siapa Saja"), 403)
    await loginAs(c, "dekan.fmipa@unila.ac.id")
    await expectApiError(c.correctOfficial("FMIPA", fmipa.periods[0].id, "Dr. Siapa Saja"), 403)
    await loginAs(c, "rektor@unila.ac.id")
    await expectApiError(c.replaceOfficial("REKTOR", "Rektor Baru", "2026-11-01"), 403)
  })

  test("koreksi rektor oleh admin fakultas mana pun tercatat", async () => {
    await loginAs(c, "admin.ft@unila.ac.id")
    const r = await rektor()
    const after = await c.correctOfficial("REKTOR", r.periods[0].id, "  Prof. Dr. Ir. Lusmeilia   Afriani ")
    expect(after.periods[0].name).toBe("Prof. Dr. Ir. Lusmeilia Afriani")
    expect(after.lastChange).toMatchObject({ kind: "KOREKSI", office: "REKTOR", before: LUSMEILIA, after: "Prof. Dr. Ir. Lusmeilia Afriani", by: "admin.ft (off-chain)" })
    await expectApiError(c.correctOfficial("REKTOR", r.periods[0].id, "ab"), 400)
  })

  test("pergantian: tanggal tidak sah 409, sah menutup periode lama", async () => {
    await loginAs(c, "admin.fmipa@unila.ac.id")
    await expectApiError(c.replaceOfficial("REKTOR", "Rektor Baru, M.Sc.", "2026-11-12"), 409)
    await expectApiError(c.replaceOfficial("REKTOR", "Rektor Baru, M.Sc.", "2023-01-01"), 409)
    const after = await c.replaceOfficial("REKTOR", "Rektor Baru, M.Sc.", "2026-11-01")
    expect(after.periods.map((p) => [p.name, p.from, p.to])).toEqual([
      [LUSMEILIA, "2023-01-01", "2026-10-31"],
      ["Rektor Baru, M.Sc.", "2026-11-01", null],
    ])
    expect(after.lastChange).toMatchObject({ kind: "PERGANTIAN", before: LUSMEILIA, after: "Rektor Baru, M.Sc.", by: "admin.fmipa (off-chain)" })
  })

  test("verifikasi memakai nama pejabat saat pengesahan; koreksi periode lama ikut", async () => {
    let v = await c.verify("2017051008")
    expect(v.dekanName).toBe("Dr. Eng. Heri Satria, S.Si., M.Si.")
    expect(v.rektorName).toBe(LUSMEILIA)
    await loginAs(c, "admin.fmipa@unila.ac.id")
    await c.replaceOfficial("REKTOR", "Rektor Baru, M.Sc.", "2026-11-01")
    const old = (await rektor()).periods[0]
    await c.correctOfficial("REKTOR", old.id, "Prof. Lusmeilia Afriani (koreksi)")
    await c.logout()
    v = await c.verify("2017051008") // disahkan Rektor sekitar Oktober 2026
    expect(v.rektorName).toBe("Prof. Lusmeilia Afriani (koreksi)")
    await loginAs(c, "admin.fmipa@unila.ac.id")
    const changes = await c.officialChanges("REKTOR")
    expect(changes.map((x) => x.kind)).toEqual(["KOREKSI", "PERGANTIAN"])
  })
})

test("koreksi tanpa perubahan nama ditolak dan tidak tercatat", async () => {
  const c = createMockClient({ latencyMs: 0 })
  await loginAs(c, "admin.fmipa@unila.ac.id")
  const r = (await c.listOfficials())[0]
  await expectApiError(c.correctOfficial("REKTOR", r.periods[0].id, `  ${r.periods[0].name}  `), 400)
  expect((await c.listOfficials())[0].lastChange).toBeNull()
})

test("ledgerInfo: tinggi chain naik satu per transaksi ledger, bukan per peristiwa off-chain", async () => {
  const before = await client.ledgerInfo()
  expect(before).toMatchObject({ channel: "skpi-channel", msp: "UnilaMSP" })
  expect(before.height).toBeGreaterThan(0)
  expect(Date.parse(before.checkedAt)).not.toBeNaN()
  const d = await submit(client, input())
  expect((await client.ledgerInfo()).height).toBe(before.height)
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  await client.approveDraft(d.id)
  expect((await client.ledgerInfo()).height).toBe(before.height + 1)
})

test("ledgerInfo: peer tidak terjangkau → 503", async () => {
  const c = createMockClient({ latencyMs: 0, seed: false })
  c.setChainOnline(false)
  await expectApiError(c.ledgerInfo(), 503)
  c.setChainOnline(true)
  await expect(c.ledgerInfo()).resolves.toMatchObject({ channel: "skpi-channel" })
})
