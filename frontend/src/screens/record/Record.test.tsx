import { screen, within } from "@testing-library/react"
import { createMockClient } from "@/api/mock/mockClient"
import { loginAs, renderApp } from "@/test/renderApp"

const ADMIN = "admin.fmipa@unila.ac.id"

async function open(path = "/catat") {
  const client = createMockClient({ latencyMs: 0 })
  await loginAs(client, ADMIN)
  const r = await renderApp(path, { client })
  await screen.findByRole("heading", { name: "Ajukan SKPI ke Dekan" })
  return r
}

type User = Awaited<ReturnType<typeof renderApp>>["user"]

async function fillValid(user: User) {
  await user.type(screen.getByLabelText("NPM"), "2317051501")
  await user.type(screen.getByLabelText("Nama lulusan"), "Rania Kusuma Dewi")
  await user.type(screen.getByLabelText("Nomor SKPI"), "011/UN26.17/SKPI/2026")
  await user.type(screen.getByLabelText("Total SKP"), "214")
}

test("validasi fakultas, kode unit, dan predikat otomatis", async () => {
  const { user } = await open()
  await user.type(screen.getByLabelText("NPM"), "2315051001")
  await user.tab()
  expect(await screen.findByText(/bukan mahasiswa FMIPA/)).toBeInTheDocument()

  await user.type(screen.getByLabelText("Nomor SKPI"), "001/UN26.15/SKPI/2026")
  await user.tab()
  expect(screen.getByText(/Kode unit harus UN26.17/)).toBeInTheDocument()

  await user.type(screen.getByLabelText("Total SKP"), "226")
  expect(screen.getByLabelText("Predikat")).toHaveValue("Unggul")
  expect(screen.getByText(/> 225/)).toBeInTheDocument()
})

test("tanpa isian penerbit dan waktu terbit; fakultas dari akun", async () => {
  await open()
  expect(screen.queryByLabelText(/Issuer/)).toBeNull()
  expect(screen.queryByLabelText(/Waktu terbit/)).toBeNull()
  expect(screen.getByText("FMIPA · UN26.17")).toBeInTheDocument()
})

test("kirim valid menghasilkan bukti draft tanpa transaksi, klik ganda sekali kirim", async () => {
  const { user, client } = await open()
  const spy = vi.spyOn(client, "createDraft")
  await fillValid(user)
  await user.dblClick(screen.getByRole("button", { name: /Ajukan ke Dekan/ }))
  expect(await screen.findByRole("heading", { name: "Draft diajukan ke Dekan." })).toBeInTheDocument()
  expect(screen.getByText(/belum masuk ledger/)).toBeInTheDocument()
  expect(screen.queryByText(/ID transaksi/)).toBeNull()
  expect(spy).toHaveBeenCalledTimes(1)
  expect((await client.getRecord("2317051501")).status).toBe("MENUNGGU_DEKAN")
})

test("galat server tampil di formulir", async () => {
  const { user } = await open()
  await user.type(screen.getByLabelText("NPM"), "2017051008") // sudah AKTIF di seed
  await user.type(screen.getByLabelText("Nama lulusan"), "Nabila Azzahra")
  await user.type(screen.getByLabelText("Nomor SKPI"), "099/UN26.17/SKPI/2026")
  await user.type(screen.getByLabelText("Total SKP"), "214")
  await user.click(screen.getByRole("button", { name: /Ajukan ke Dekan/ }))
  expect(await screen.findByRole("alert")).toHaveTextContent(/sudah memiliki SKPI berstatus AKTIF/)
})

test("NPM terisi dari ?npm (catat ulang)", async () => {
  await open("/catat?npm=2017051042")
  expect(screen.getByLabelText("NPM")).toHaveValue("2017051042")
})

const CSV = [
  "npm;name;skpiId;programStudy;totalSKP",
  "2317051601;Yoga Pratama Putra;021/UN26.17/SKPI/2026;S1 Ilmu Komputer;168",
  "2317051602;Nadia Safitri;022/UN26.17/SKPI/2026;S1 Matematika;121",
  "2315051603;Salah Fakultas;023/UN26.17/SKPI/2026;S1 Ilmu Komputer;121",
].join("\n")

async function loadBatch(user: User) {
  await user.click(screen.getByRole("tab", { name: "Batch (CSV)" }))
  await user.click(screen.getByRole("button", { name: "Tempel data" }))
  await user.click(screen.getByLabelText("Data CSV"))
  await user.paste(CSV)
  await user.click(screen.getByRole("button", { name: "Muat ke tabel" }))
}

test("batch menandai baris salah dan hanya mengirim yang valid", async () => {
  const { user, client } = await open()
  await loadBatch(user)
  const rows = screen.getAllByRole("row").slice(1)
  expect(rows).toHaveLength(3)
  expect(within(rows[2]).getByText(/bukan mahasiswa FMIPA/)).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: /Ajukan 2 SKPI/ }))
  expect(await screen.findByRole("heading", { name: "2 draft diajukan ke Dekan." })).toBeInTheDocument()
  expect((await client.getRecord("2317051602")).status).toBe("MENUNGGU_DEKAN")
})

test("galat server per baris ditampilkan pada barisnya", async () => {
  const { user, client } = await open()
  vi.spyOn(client, "createDrafts").mockImplementation(async (items) => ({
    created: [],
    errors: items.map((it, index) => ({ index, npm: it.npm, message: `Nomor SKPI sudah dipakai SKPI lain (${it.npm}).` })),
  }))
  await loadBatch(user)
  await user.click(screen.getByRole("button", { name: /Ajukan 2 SKPI/ }))
  expect(await screen.findByText("Nomor SKPI sudah dipakai SKPI lain (2317051601).")).toBeInTheDocument()
  expect(screen.getByText("Nomor SKPI sudah dipakai SKPI lain (2317051602).")).toBeInTheDocument()
})
