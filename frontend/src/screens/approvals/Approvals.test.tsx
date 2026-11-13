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

describe("antrean: jumlah baris per halaman (10, 50, 100, semua)", () => {
  const KEY = "skpi.antrean.perHalaman"
  beforeEach(() => localStorage.clear())

  /** Antrean Rektor sintetis berisi n SKPI ("Lulusan 001", "Lulusan 002", ...). */
  async function openMany(n: number) {
    const client = createMockClient({ latencyMs: 0 })
    await loginAs(client, "rektor@unila.ac.id")
    const base = (await client.listQueue()).find((q) => q.kind === "rektor")!
    const items = Array.from({ length: n }, (_, i) => {
      const k = String(i + 1).padStart(3, "0")
      return { kind: "rektor" as const, record: { ...base.record!, npm: `2317${String(100000 + i + 1).slice(-6)}`, name: `Lulusan ${k}`, skpiId: `${k}/UN26.17/SKPI/2026` } }
    })
    vi.spyOn(client, "listQueue").mockResolvedValue(items)
    const r = await renderApp("/antrean", { client })
    await screen.findByRole("heading", { name: "Antrean pengesahan" })
    await screen.findAllByRole("button", { name: "Tinjau" })
    return r
  }
  const shown = () => screen.getAllByRole("button", { name: "Tinjau" }).length
  const sizeSelect = () => screen.getByRole("combobox", { name: "Baris per halaman" })
  const choose = (user: ReturnType<typeof userEvent.setup>, value: string) => user.selectOptions(sizeSelect(), value)

  test("bawaan 10 baris dengan keterangan jumlah", async () => {
    await openMany(120)
    expect(shown()).toBe(10)
    expect(screen.getByText(/Menampilkan 1–10 dari 120/)).toBeInTheDocument()
    expect(screen.getByRole("row", { name: /Lulusan 001/ })).toBeInTheDocument()
    expect(screen.queryByRole("row", { name: /Lulusan 011/ })).toBeNull()
  })

  test("pilihan berisi 10, 50, 100, dan Semua", async () => {
    await openMany(120)
    expect(within(sizeSelect()).getAllByRole("option").map((o) => o.textContent)).toEqual(["10", "50", "100", "Semua"])
  })

  test.each([
    ["50", 50],
    ["100", 100],
    ["10", 10],
  ])("memilih %s menampilkan %i baris", async (value, count) => {
    const { user } = await openMany(120)
    await choose(user, value === "10" ? "50" : "10") // pastikan berubah dari nilai awal
    await choose(user, value)
    expect(shown()).toBe(count)
    expect(screen.getByText(new RegExp(`Menampilkan 1–${count} dari 120`))).toBeInTheDocument()
  })

  test("Semua menampilkan seluruh baris tanpa tombol halaman", async () => {
    const { user } = await openMany(120)
    await choose(user, "all")
    expect(shown()).toBe(120)
    expect(screen.getByText(/Menampilkan 1–120 dari 120/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Berikutnya" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Sebelumnya" })).toBeNull()
  })

  test("berpindah halaman: berikutnya menampilkan 11–20, sebelumnya kembali; tombol nonaktif di ujung", async () => {
    const { user } = await openMany(25)
    expect(screen.getByText(/Halaman 1 dari 3/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sebelumnya" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Berikutnya" }))
    expect(screen.getByText(/Menampilkan 11–20 dari 25/)).toBeInTheDocument()
    expect(screen.getByRole("row", { name: /Lulusan 011/ })).toBeInTheDocument()
    expect(screen.queryByRole("row", { name: /Lulusan 001/ })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Berikutnya" }))
    expect(screen.getByText(/Menampilkan 21–25 dari 25/)).toBeInTheDocument()
    expect(shown()).toBe(5)
    expect(screen.getByRole("button", { name: "Berikutnya" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Sebelumnya" }))
    expect(screen.getByText(/Menampilkan 11–20 dari 25/)).toBeInTheDocument()
  })

  test("mengganti jumlah baris kembali ke halaman pertama", async () => {
    const { user } = await openMany(120)
    await user.click(screen.getByRole("button", { name: "Berikutnya" }))
    await user.click(screen.getByRole("button", { name: "Berikutnya" }))
    expect(screen.getByText(/Menampilkan 21–30 dari 120/)).toBeInTheDocument()
    await choose(user, "50")
    expect(screen.getByText(/Menampilkan 1–50 dari 120/)).toBeInTheDocument()
  })

  test("pencarian kembali ke halaman pertama dan jumlah mengikuti hasil", async () => {
    const { user } = await openMany(120)
    await user.click(screen.getByRole("button", { name: "Berikutnya" }))
    await user.type(screen.getByLabelText("Cari di antrean"), "Lulusan 05")
    expect(screen.getByText(/Menampilkan 1–10 dari 10/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Berikutnya" })).toBeNull()
    expect(shown()).toBe(10)
  })

  test("total tidak melebihi ukuran halaman: tanpa tombol halaman", async () => {
    await openMany(7)
    expect(screen.getByText(/Menampilkan 1–7 dari 7/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Berikutnya" })).toBeNull()
  })

  test("Pilih semua hanya memilih baris yang sedang tampil", async () => {
    const { user } = await openMany(120)
    await user.click(screen.getByRole("checkbox", { name: "Pilih semua" }))
    expect(screen.getByText("10 dipilih")).toBeInTheDocument()
    await choose(user, "50")
    expect(screen.getByRole("checkbox", { name: "Pilih semua" })).not.toBeChecked() // baris 11-50 belum terpilih
    await user.click(screen.getByRole("checkbox", { name: "Pilih semua" }))
    expect(screen.getByText("50 dipilih")).toBeInTheDocument()
  })

  test("pilihan jumlah baris diingat di peramban dan dipulihkan", async () => {
    const { user, unmount } = await openMany(120)
    await choose(user, "50")
    expect(localStorage.getItem(KEY)).toBe("50")
    unmount()
    await openMany(120)
    expect(shown()).toBe(50)
    expect(sizeSelect()).toHaveValue("50")
  })

  test("nilai tersimpan yang tidak sah diabaikan (kembali ke 10)", async () => {
    localStorage.setItem(KEY, "7")
    await openMany(120)
    expect(shown()).toBe(10)
  })
})

describe("pengesahan massal: status belum pasti dibedakan dari gagal", () => {
  test("item berstatus COMMIT_UNKNOWN ditampilkan sebagai menunggu konfirmasi, bukan gagal", async () => {
    const { user, client } = await open("dekan.fmipa@unila.ac.id")
    const real = client.approveDraftsBatch.bind(client)
    vi.spyOn(client, "approveDraftsBatch").mockImplementation(async (ids) => {
      const [first, ...rest] = ids
      const ok = await real([first])
      return [
        ...ok,
        ...rest.map((id) => ({ key: id, ok: false as const, status: 503, code: "COMMIT_UNKNOWN", message: "Status transaksi belum pasti; sistem akan memeriksanya kembali." })),
      ]
    })
    await selectAndRun(user, ["Aulia Rahmawati", "Bagas Prakoso", "Rizky Maulana"], "draft")
    const result = await screen.findByRole("dialog", { name: "1 berhasil, 2 menunggu konfirmasi, 0 gagal" })
    expect(within(result).getAllByLabelText("Menunggu konfirmasi")).toHaveLength(2)
    expect(within(result).getAllByText("Status transaksi belum pasti; sistem sedang memastikannya di ledger.")).toHaveLength(2)
    expect(within(result).queryByText("Layanan ledger sedang tidak terjangkau.")).toBeNull()
    expect(result).toHaveTextContent(/dipastikan otomatis/)
  })

  test("tanpa status belum pasti, judul tetap 'X berhasil, Y gagal'", async () => {
    const { user, client } = await open("dekan.fmipa@unila.ac.id")
    vi.spyOn(client, "approveDraftsBatch").mockResolvedValue([
      { key: "x", ok: false, status: 409, code: "CONFLICT", message: "Nomor SKPI sudah dipakai." },
    ])
    await selectAndRun(user, ["Aulia Rahmawati"], "draft")
    expect(await screen.findByRole("dialog", { name: "0 berhasil, 1 gagal" })).toBeInTheDocument()
  })
})
