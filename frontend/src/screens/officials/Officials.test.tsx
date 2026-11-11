import { screen, waitFor, within } from "@testing-library/react"
import { renderApp } from "@/test/renderApp"

const LUSMEILIA = "Prof. Dr. Ir. Lusmeilia Afriani, D.E.A., IPM., ASEAN Eng."

async function open(email: string) {
  const r = await renderApp("/pejabat", { as: email })
  await screen.findByRole("heading", { name: "Pejabat" })
  const rektor = await screen.findByRole("region", { name: "Rektor" })
  await within(rektor).findByText(LUSMEILIA)
  return { ...r, rektor }
}
const dekanRow = (code: string) => screen.getByRole("row", { name: new RegExp(`\\b${code}\\b`) })

test("admin FMIPA: rektor dan dekan fakultasnya dapat diubah, fakultas lain tidak", async () => {
  const { rektor } = await open("admin.fmipa@unila.ac.id")
  expect(rektor).toHaveTextContent("menjabat sejak")
  expect(screen.getAllByRole("row").slice(1)).toHaveLength(8)
  expect(within(rektor).getByRole("button", { name: "Koreksi nama" })).toBeInTheDocument()
  expect(within(rektor).getByRole("button", { name: "Catat pergantian" })).toBeInTheDocument()
  expect(within(dekanRow("FMIPA")).getByRole("button", { name: "Koreksi nama" })).toBeInTheDocument()
  expect(within(dekanRow("FT")).queryByRole("button", { name: "Koreksi nama" })).toBeNull()
  expect(within(dekanRow("FT")).queryByRole("button", { name: "Catat pergantian" })).toBeNull()
})

test("dekan hanya membaca", async () => {
  await open("dekan.fmipa@unila.ac.id")
  expect(screen.queryByRole("button", { name: "Koreksi nama" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Catat pergantian" })).toBeNull()
  expect(screen.getByText("Nama pejabat dikelola admin fakultas.")).toBeInTheDocument()
})

test("koreksi rektor: tersimpan, toast, keterangan admin terakhir; klik ganda sekali kirim", async () => {
  const { user, client, rektor } = await open("admin.fmipa@unila.ac.id")
  const spy = vi.spyOn(client, "correctOfficial")
  await user.click(within(rektor).getByRole("button", { name: "Koreksi nama" }))
  const modal = await screen.findByRole("dialog", { name: "Koreksi nama Rektor" })
  const field = within(modal).getByLabelText("Nama & gelar lengkap")
  await user.clear(field)
  await user.type(field, "Prof. Dr. Ir. Lusmeilia Afriani, D.E.A.")
  await user.dblClick(within(modal).getByRole("button", { name: "Simpan" }))
  expect(await screen.findByText("Nama Rektor dikoreksi")).toBeInTheDocument()
  expect(spy).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(rektor).toHaveTextContent("terakhir diubah oleh admin.fmipa (off-chain)"))
  expect(rektor).toHaveTextContent("Prof. Dr. Ir. Lusmeilia Afriani, D.E.A.")
})

test("pergantian dengan tanggal tidak sah menampilkan galat di modal", async () => {
  const { user } = await open("admin.fmipa@unila.ac.id")
  await user.click(within(dekanRow("FMIPA")).getByRole("button", { name: "Catat pergantian" }))
  const modal = await screen.findByRole("dialog", { name: "Catat pergantian Dekan FMIPA" })
  await user.type(within(modal).getByLabelText("Nama & gelar lengkap"), "Dr. Dekan Baru, M.Si.")
  await user.type(within(modal).getByLabelText("Tanggal mulai menjabat"), "2023-01-01")
  await user.click(within(modal).getByRole("button", { name: "Simpan" }))
  expect(await within(modal).findByRole("alert")).toHaveTextContent("Tanggal mulai harus setelah 2023-01-01")
  expect(screen.getByRole("dialog", { name: "Catat pergantian Dekan FMIPA" })).toBeInTheDocument()
})

test("riwayat rektor menampilkan periode dan perubahan", async () => {
  const { user, client, rektor } = await open("admin.fmipa@unila.ac.id")
  const r = (await client.listOfficials())[0]
  await client.correctOfficial("REKTOR", r.periods[0].id, "Prof. Lusmeilia Afriani")
  await user.click(within(rektor).getByRole("button", { name: "Riwayat" }))
  const drawer = await screen.findByRole("dialog", { name: "Riwayat Rektor" })
  const changes = await within(drawer).findByRole("list", { name: "Perubahan" })
  expect(within(changes).getAllByRole("listitem")[0]).toHaveTextContent(/KOREKSI/i)
  expect(within(changes).getAllByRole("listitem")[0]).toHaveTextContent(`${LUSMEILIA} → Prof. Lusmeilia Afriani`)
  expect(within(changes).getAllByRole("listitem")[0]).toHaveTextContent("admin.fmipa (off-chain)")
  expect(within(drawer).getByRole("list", { name: "Periode jabatan" })).toHaveTextContent("2023")
})

test("menu Pejabat tersedia untuk semua staf", async () => {
  await renderApp("/ikhtisar", { as: "rektor@unila.ac.id" })
  expect((await screen.findAllByRole("link", { name: /Pejabat/ }))[0]).toBeInTheDocument()
})

test("Simpan koreksi nonaktif selama nama belum diubah", async () => {
  const { user, rektor } = await open("admin.fmipa@unila.ac.id")
  await user.click(within(rektor).getByRole("button", { name: "Koreksi nama" }))
  const modal = await screen.findByRole("dialog", { name: "Koreksi nama Rektor" })
  expect(within(modal).getByRole("button", { name: "Simpan" })).toBeDisabled()
})

test("riwayat jabatan lain tidak menampilkan perubahan jabatan sebelumnya saat memuat", async () => {
  const { user, client, rektor } = await open("admin.fmipa@unila.ac.id")
  const r = (await client.listOfficials())[0]
  await client.correctOfficial("REKTOR", r.periods[0].id, "Prof. Lusmeilia Afriani")
  await user.click(within(rektor).getByRole("button", { name: "Riwayat" }))
  await within(await screen.findByRole("dialog", { name: "Riwayat Rektor" })).findByRole("list", { name: "Perubahan" })
  await user.keyboard("{Escape}")
  let release!: () => void
  const real = client.officialChanges.bind(client)
  vi.spyOn(client, "officialChanges").mockImplementation(async (o) => {
    await new Promise<void>((res) => (release = res))
    return real(o)
  })
  await user.click(within(dekanRow("FMIPA")).getByRole("button", { name: "Riwayat" }))
  const drawer = await screen.findByRole("dialog", { name: "Riwayat Dekan FMIPA" })
  expect(within(drawer).queryByText(/Prof. Lusmeilia Afriani/)).toBeNull()
  release()
  expect(await within(drawer).findByText("Belum ada perubahan.")).toBeInTheDocument()
})
