import { screen, within } from "@testing-library/react"
import { ApiError } from "@/api/errors"
import { createMockClient } from "@/api/mock/mockClient"
import { renderApp } from "@/test/renderApp"

const input = () => screen.getByLabelText("NPM atau nama lulusan")
const submit = () => screen.getByRole("button", { name: /Verifikasi dokumen/ })

async function portal() {
  const client = createMockClient({ latencyMs: 0 })
  const r = await renderApp("/verifikasi", { client })
  await screen.findByRole("heading", { name: /Periksa keabsahan SKPI/ })
  return r
}

test("NPM dengan spasi langsung ke hasil tanpa pencarian nama", async () => {
  const { user, client } = await portal()
  const spy = vi.spyOn(client, "searchPublic")
  await user.type(input(), "2317 0510 01")
  await user.click(submit())
  expect(await screen.findByRole("heading", { level: 1, name: "Tidak terdaftar" })).toBeInTheDocument()
  expect(spy).not.toHaveBeenCalled()
})

test("isian terlalu pendek atau NPM tidak 10 digit", async () => {
  const { user } = await portal()
  await user.type(input(), "ri")
  await user.click(submit())
  expect(screen.getByText("Masukkan minimal 3 huruf nama atau 10 digit NPM.")).toBeInTheDocument()
  await user.clear(input())
  await user.type(input(), "12345")
  await user.click(submit())
  expect(screen.getByText("Masukkan minimal 3 huruf nama atau 10 digit NPM.")).toBeInTheDocument()
})

test("nama sama: kandidat dibedakan NPM dan prodi", async () => {
  const { user } = await portal()
  await user.type(input(), "rizky maulana")
  await user.click(submit())
  const list = await screen.findByRole("list", { name: "Kandidat lulusan" })
  const items = within(list).getAllByRole("link")
  expect(items).toHaveLength(2)
  expect(within(list).getByText("2017051021")).toBeInTheDocument()
  expect(within(list).getByText(/S1 Teknik Sipil/)).toBeInTheDocument()
  await user.click(within(list).getByRole("link", { name: /2017051021/ }))
  expect(await screen.findByRole("heading", { level: 1, name: "Terdaftar" })).toBeInTheDocument()
})

test("hasil nama dibatasi 10", async () => {
  const client = createMockClient({ latencyMs: 0 })
  vi.spyOn(client, "searchPublic").mockResolvedValue({
    candidates: Array.from({ length: 10 }, (_, i) => ({
      npm: `23170510${String(i).padStart(2, "0")}`,
      name: "Budi Santoso",
      programStudy: "S1 Ilmu Komputer",
      facultyCode: "FMIPA" as const,
    })),
    truncated: true,
  })
  await renderApp("/verifikasi?q=budi%20santoso", { client })
  const list = await screen.findByRole("list", { name: "Kandidat lulusan" })
  expect(within(list).getAllByRole("link")).toHaveLength(10)
  expect(screen.getByText("Hasil dibatasi 10, perjelas nama atau gunakan NPM")).toBeInTheDocument()
})

test("terdaftar: metadata publik dan penanda tangan, tanpa txId", async () => {
  await renderApp("/verifikasi/2017051008")
  expect(await screen.findByRole("heading", { level: 1, name: "Terdaftar" })).toBeInTheDocument()
  const table = screen.getByRole("table", { name: "Metadata SKPI" })
  for (const k of ["Nama lulusan", "NPM", "Nomor SKPI", "Program studi", "Total SKP", "Predikat", "Penerbit", "Waktu terbit"])
    expect(within(table).getByText(k)).toBeInTheDocument()
  expect(within(table).getByText("Nabila Azzahra")).toBeInTheDocument()
  const signers = screen.getByRole("region", { name: "Penanda tangan" })
  expect(signers).toHaveTextContent("Rektor Contoh Periode 2023–2027")
  expect(signers).toHaveTextContent("Dekan Fakultas Matematika dan Ilmu Pengetahuan Alam")
  expect(signers).toHaveTextContent("WIB")
  expect(screen.queryByText(/ID transaksi/)).toBeNull()
  expect(screen.queryByText("Masukan")).toBeNull()
})

test("dicabut: tanpa alasan pencabutan", async () => {
  await renderApp("/verifikasi/2017051042")
  expect(await screen.findByRole("heading", { level: 1, name: "Dicabut" })).toBeInTheDocument()
  expect(screen.queryByText(/Alasan pencabutan/)).toBeNull()
  expect(screen.queryByText(/kesalahan penulisan program studi/)).toBeNull()
  expect(screen.getByText("Hubungi Universitas Lampung untuk keterangan pencabutan.")).toBeInTheDocument()
})

test("belum sah", async () => {
  await renderApp("/verifikasi/2017051056")
  expect(await screen.findByRole("heading", { level: 1, name: "Belum sah" })).toBeInTheDocument()
  expect(screen.getByText("SKPI sedang menunggu pengesahan Rektor dan belum dapat dijadikan bukti.")).toBeInTheDocument()
})

test("tidak terdaftar menampilkan langkah berikutnya", async () => {
  await renderApp("/verifikasi/2017059999")
  expect(await screen.findByRole("heading", { level: 1, name: "Tidak terdaftar" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Langkah berikutnya" })).toBeInTheDocument()
})

test("429 dan 503 ditampilkan ramah, coba lagi memanggil ulang", async () => {
  const client = createMockClient({ latencyMs: 0 })
  const real = client.verify.bind(client)
  const spy = vi
    .spyOn(client, "verify")
    .mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", "Too many"))
    .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "down"))
    .mockImplementation(real)
  const { user } = await renderApp("/verifikasi/2017051008", { client })
  expect(await screen.findByRole("alert")).toHaveTextContent("Terlalu banyak permintaan, coba lagi dalam beberapa saat.")
  await user.click(screen.getByRole("button", { name: "Coba lagi" }))
  expect(await screen.findByText("Layanan ledger sedang tidak terjangkau.")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Coba lagi" }))
  expect(await screen.findByRole("heading", { level: 1, name: "Terdaftar" })).toBeInTheDocument()
  expect(spy).toHaveBeenCalledTimes(3)
})

test("data uji demo tidak tampil di luar mode mock", async () => {
  await portal()
  expect(screen.queryByText("Data uji untuk demo")).toBeNull()
})
