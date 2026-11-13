import { screen, waitFor, within } from "@testing-library/react"
import type userEvent from "@testing-library/user-event"
import { ApiError } from "@/api/errors"
import { createMockClient } from "@/api/mock/mockClient"
import { loginAs, renderApp } from "@/test/renderApp"
import { bulk } from "./queue"

async function open(email: string, path = "/antrean") {
  const client = createMockClient({ latencyMs: 0 })
  await loginAs(client, email)
  const queue = await client.listQueue()
  const r = await renderApp(path, { client })
  await screen.findByRole("heading", { name: "Antrean pengesahan" })
  await screen.findAllByRole("button", { name: "Tinjau" })
  return { ...r, queue }
}

const row = (name: string) => screen.getByRole("row", { name: new RegExp(name) })

test("dekan: kolom jenis berisi ketiga jenis draft", async () => {
  await open("dekan.fmipa@unila.ac.id")
  expect(screen.getByText("Pengesahan Dekan")).toBeInTheDocument()
  expect(screen.getByRole("columnheader", { name: "Jenis" })).toBeInTheDocument()
  expect(within(row("Aulia Rahmawati")).getByText("Pencatatan")).toBeInTheDocument()
  expect(within(row("Rizky Maulana")).getByText("Perubahan")).toBeInTheDocument()
  expect(within(row("Salsabila Putri Ramadhani")).getByText("Pencabutan")).toBeInTheDocument()
})

test("tinjau perubahan menampilkan sebelum/sesudah hanya untuk field berubah", async () => {
  const { user } = await open("dekan.fmipa@unila.ac.id")
  await user.click(within(row("Rizky Maulana")).getByRole("button", { name: "Tinjau" }))
  const dialog = await screen.findByRole("dialog")
  const diff = within(dialog).getByRole("table", { name: "Sebelum dan sesudah" })
  const rows = within(diff).getAllByRole("row").slice(1)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toHaveTextContent("Total SKP")
  expect(rows[0]).toHaveTextContent("180")
  expect(rows[0]).toHaveTextContent("230")
  expect(within(dialog).getByRole("button", { name: /Setujui \(PerbaruiSKPI\)/ })).toBeInTheDocument()
})

test("tinjau pencabutan menampilkan alasan dan tombol bahaya", async () => {
  const { user } = await open("dekan.fmipa@unila.ac.id")
  await user.click(within(row("Salsabila Putri Ramadhani")).getByRole("button", { name: "Tinjau" }))
  const dialog = await screen.findByRole("dialog")
  expect(within(dialog).getByText(/SKPI diterbitkan ganda/)).toBeInTheDocument()
  expect(within(dialog).getByRole("button", { name: /Setujui \(CabutSKPI\)/ }).className).toContain("bg-bad")
})

test("setujui pencatatan: satu transaksi walau klik ganda, toast, baris hilang", async () => {
  const { user, client } = await open("dekan.fmipa@unila.ac.id")
  const spy = vi.spyOn(client, "approveDraft")
  await user.click(within(row("Aulia Rahmawati")).getByRole("button", { name: "Tinjau" }))
  const dialog = await screen.findByRole("dialog")
  await user.dblClick(within(dialog).getByRole("button", { name: /Setujui \(SahkanDekan\)/ }))
  expect(await screen.findByText("SKPI disahkan · diteruskan ke Rektor")).toBeInTheDocument()
  expect(spy).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.queryByRole("row", { name: /Aulia Rahmawati/ })).toBeNull())
})

test("tolak dekan butuh alasan dan tetap off-chain", async () => {
  const { user, client } = await open("dekan.fmipa@unila.ac.id")
  const spy = vi.spyOn(client, "rejectDraft")
  await user.click(within(row("Bagas Prakoso")).getByRole("button", { name: "Tinjau" }))
  const dialog = await screen.findByRole("dialog")
  await user.click(within(dialog).getByRole("button", { name: "Tolak" }))
  expect(within(dialog).getByText("Alasan disimpan off-chain dan terlihat oleh admin fakultas.")).toBeInTheDocument()
  const confirm = within(dialog).getByRole("button", { name: "Tolak draft" })
  await user.type(within(dialog).getByLabelText("Alasan penolakan"), "kurang")
  expect(confirm).toBeDisabled()
  await user.type(within(dialog).getByLabelText("Alasan penolakan"), " lengkap lampirannya")
  await user.click(confirm)
  await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
  expect((await client.getRecord("2017051071")).status).toBe("DITOLAK_DEKAN")
})

test("pengesahan massal melaporkan hasil per draft", async () => {
  const { user, client, queue } = await open("dekan.fmipa@unila.ac.id")
  const bagas = queue.find((q) => q.kind === "draft" && q.draft.npm === "2017051071")!
  const target = bagas.kind === "draft" ? bagas.draft.id : ""
  const real = client.approveDraftsBatch.bind(client)
  vi.spyOn(client, "approveDraftsBatch").mockImplementation(async (ids) => {
    const ok = await real(ids.filter((id) => id !== target))
    return ids.map((id) =>
      id === target
        ? { key: id, ok: false as const, status: 409, code: "CONFLICT", message: "Nomor SKPI sudah dipakai SKPI lain." }
        : ok.find((r) => r.key === id)!,
    )
  })
  for (const name of ["Aulia Rahmawati", "Bagas Prakoso", "Rizky Maulana"])
    await user.click(screen.getByRole("checkbox", { name: `Pilih ${name}` }))
  await user.click(screen.getByRole("button", { name: /Sahkan terpilih/ }))
  const confirm = await screen.findByRole("dialog", { name: "Sahkan 3 draft?" })
  await user.click(within(confirm).getByRole("button", { name: /Sahkan 3 draft/ }))
  const result = await screen.findByRole("dialog", { name: "2 berhasil, 1 gagal" })
  expect(within(result).getByText("Nomor SKPI sudah dipakai SKPI lain.")).toBeInTheDocument()
  await user.click(within(result).getByRole("button", { name: "Selesai" }))
  await waitFor(() => expect(screen.getByRole("row", { name: /Bagas Prakoso/ })).toBeInTheDocument())
  expect(screen.queryByRole("row", { name: /Aulia Rahmawati/ })).toBeNull()
})

test("rektor: antrean lintas fakultas, tolak lewat TolakRektor", async () => {
  const { user, client } = await open("rektor@unila.ac.id")
  expect(screen.getByText("Pengesahan Rektor")).toBeInTheDocument()
  expect(screen.queryByRole("columnheader", { name: "Jenis" })).toBeNull()
  expect(row("Fajar Pratama")).toBeInTheDocument()
  expect(row("Andi Wijaya")).toBeInTheDocument()
  const spy = vi.spyOn(client, "rektorReject")
  await user.click(within(row("Andi Wijaya")).getByRole("button", { name: "Tinjau" }))
  const dialog = await screen.findByRole("dialog")
  await user.click(within(dialog).getByRole("button", { name: "Tolak" }))
  expect(within(dialog).getByText("Alasan dicatat di ledger (TolakRektor).")).toBeInTheDocument()
  await user.type(within(dialog).getByLabelText("Alasan penolakan"), "Lampiran capaian belum lengkap")
  await user.click(within(dialog).getByRole("button", { name: /Tolak \(TolakRektor\)/ }))
  await waitFor(() => expect(spy).toHaveBeenCalledWith("2015061024", "Lampiran capaian belum lengkap"))
})

test("rektor: sahkan menampilkan toast aktif", async () => {
  const { user } = await open("rektor@unila.ac.id")
  await user.click(within(row("Fajar Pratama")).getByRole("button", { name: "Tinjau" }))
  const dialog = await screen.findByRole("dialog")
  await user.click(within(dialog).getByRole("button", { name: /Sahkan \(SahkanRektor\)/ }))
  expect(await screen.findByText("SKPI disahkan · kini aktif di ledger")).toBeInTheDocument()
})

test("?tinjau membuka modal tinjau untuk NPM itu", async () => {
  await open("dekan.fmipa@unila.ac.id", "/antrean?tinjau=2017051064")
  expect(await screen.findByRole("dialog", { name: /Aulia Rahmawati/ })).toBeInTheDocument()
})

test("alasan multi-baris dikirim sebagai satu baris", async () => {
  const { user, client } = await open("rektor@unila.ac.id")
  const spy = vi.spyOn(client, "rektorReject")
  await user.click(within(row("Andi Wijaya")).getByRole("button", { name: "Tinjau" }))
  const dialog = await screen.findByRole("dialog")
  await user.click(within(dialog).getByRole("button", { name: "Tolak" }))
  await user.type(within(dialog).getByLabelText("Alasan penolakan"), "Lampiran belum lengkap.{Enter}Mohon dilengkapi.")
  await user.click(within(dialog).getByRole("button", { name: /Tolak \(TolakRektor\)/ }))
  await waitFor(() => expect(spy).toHaveBeenCalledWith("2015061024", "Lampiran belum lengkap. Mohon dilengkapi."))
})

test("pencabutan tidak bisa disahkan massal; daftar massal menampilkan jenis", async () => {
  const { user, queue } = await open("dekan.fmipa@unila.ac.id")
  expect(screen.getByRole("checkbox", { name: "Pilih Salsabila Putri Ramadhani" })).toBeDisabled()
  await user.click(screen.getByRole("checkbox", { name: "Pilih semua" }))
  const n = queue.filter((q) => !(q.kind === "draft" && q.draft.type === "PENCABUTAN")).length
  await user.click(screen.getByRole("button", { name: /Sahkan terpilih/ }))
  const dialog = await screen.findByRole("dialog", { name: `Sahkan ${n} draft?` })
  expect(within(dialog).queryByText("Salsabila Putri Ramadhani")).toBeNull()
  expect(within(dialog).getAllByText("Pencatatan").length).toBeGreaterThan(0)
  expect(within(dialog).getByText("Perubahan")).toBeInTheDocument()
})

async function selectAndRun(user: ReturnType<typeof userEvent.setup>, names: string[], noun: string) {
  for (const name of names) await user.click(screen.getByRole("checkbox", { name: `Pilih ${name}` }))
  await user.click(screen.getByRole("button", { name: /Sahkan terpilih/ }))
  const confirm = await screen.findByRole("dialog", { name: `Sahkan ${names.length} ${noun}?` })
  await user.click(within(confirm).getByRole("button", { name: new RegExp(`Sahkan ${names.length} ${noun}`) }))
}

describe("pengesahan massal: satu permintaan batch per kelompok (satu blok)", () => {
  afterEach(() => {
    bulk.size = 100
  })

  test("ukuran kelompok bawaan = batas satu blok (100 transaksi per blok di konfigurasi kanal)", () => {
    expect(bulk.size).toBe(100)
  })

  test("dekan: semua terpilih dikirim dalam SATU permintaan batch, bukan satu permintaan per draft", async () => {
    const { user, client } = await open("dekan.fmipa@unila.ac.id")
    const batch = vi.spyOn(client, "approveDraftsBatch")
    const single = vi.spyOn(client, "approveDraft")
    await selectAndRun(user, ["Aulia Rahmawati", "Bagas Prakoso", "Rizky Maulana"], "draft")
    await screen.findByRole("dialog", { name: "3 berhasil, 0 gagal" })
    expect(batch).toHaveBeenCalledTimes(1)
    expect(batch.mock.calls[0][0]).toHaveLength(3)
    expect(single).not.toHaveBeenCalled()
  })

  test("lebih banyak dari ukuran kelompok → beberapa permintaan berurutan, tiap kelompok tidak melebihi ukuran", async () => {
    bulk.size = 2
    const { user, client } = await open("dekan.fmipa@unila.ac.id")
    const real = client.approveDraftsBatch.bind(client)
    let running = 0
    let peak = 0
    const sizes: number[] = []
    vi.spyOn(client, "approveDraftsBatch").mockImplementation(async (ids) => {
      running++
      peak = Math.max(peak, running)
      sizes.push(ids.length)
      await new Promise((r) => setTimeout(r, 10))
      running--
      return real(ids)
    })
    await selectAndRun(user, ["Aulia Rahmawati", "Bagas Prakoso", "Rizky Maulana"], "draft")
    await screen.findByRole("dialog", { name: "3 berhasil, 0 gagal" })
    expect(sizes).toEqual([2, 1])
    expect(peak).toBe(1) // kelompok berikutnya baru dikirim setelah kelompok sebelumnya selesai
  })

  test("permintaan batch gagal seluruhnya (ledger mati): semua item kelompok gagal dengan pesan ramah dan tetap di antrean", async () => {
    const { user, client } = await open("dekan.fmipa@unila.ac.id")
    vi.spyOn(client, "approveDraftsBatch").mockRejectedValue(new ApiError(503, "UNAVAILABLE", "down"))
    await selectAndRun(user, ["Aulia Rahmawati", "Bagas Prakoso"], "draft")
    const result = await screen.findByRole("dialog", { name: "0 berhasil, 2 gagal" })
    expect(within(result).getAllByText("Layanan ledger sedang tidak terjangkau.")).toHaveLength(2)
    await user.click(within(result).getByRole("button", { name: "Selesai" }))
    await waitFor(() => expect(screen.getByRole("row", { name: /Aulia Rahmawati/ })).toBeInTheDocument())
  })

  test("hasil per item dicocokkan lewat kunci, bukan urutan jawaban", async () => {
    const { user, client } = await open("dekan.fmipa@unila.ac.id")
    const real = client.approveDraftsBatch.bind(client)
    vi.spyOn(client, "approveDraftsBatch").mockImplementation(async (ids) => (await real(ids)).reverse())
    await selectAndRun(user, ["Aulia Rahmawati", "Bagas Prakoso"], "draft")
    await screen.findByRole("dialog", { name: "2 berhasil, 0 gagal" })
  })

  test("rektor: pengesahan massal memakai rektorApproveBatch dengan NPM, satu permintaan", async () => {
    const { user, client } = await open("rektor@unila.ac.id")
    const batch = vi.spyOn(client, "rektorApproveBatch")
    const single = vi.spyOn(client, "rektorApprove")
    await selectAndRun(user, ["Fajar Pratama", "Andi Wijaya"], "SKPI")
    await screen.findByRole("dialog", { name: "2 berhasil, 0 gagal" })
    expect(batch).toHaveBeenCalledTimes(1)
    expect(batch.mock.calls[0][0]).toHaveLength(2)
    expect(single).not.toHaveBeenCalled()
  })
})
