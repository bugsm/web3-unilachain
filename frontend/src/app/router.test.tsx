import { screen, waitFor, within } from "@testing-library/react"
import { createMockClient } from "@/api/mock/mockClient"
import { findBreadcrumb, loginAs, renderApp } from "@/test/renderApp"

test("rute staf tanpa sesi diarahkan ke halaman masuk", async () => {
  await renderApp("/ikhtisar")
  expect(await screen.findByRole("heading", { name: "Masuk ke Sistem Pengesahan SKPI" })).toBeInTheDocument()
})

test("peran yang tidak berhak diarahkan ke ikhtisar", async () => {
  await renderApp("/catat", { as: "dekan.fmipa@unila.ac.id" })
  const crumb = await findBreadcrumb()
  expect(within(crumb).getByText("Ikhtisar")).toBeInTheDocument()
})

test("navigasi admin tanpa antrean dan tanpa peran demo", async () => {
  await renderApp("/ikhtisar", { as: "admin.fmipa@unila.ac.id" })
  await findBreadcrumb()
  expect(screen.getAllByRole("link", { name: /Catat SKPI/ })[0]).toBeInTheDocument()
  expect(screen.queryByRole("link", { name: /Antrean pengesahan/ })).not.toBeInTheDocument()
  expect(screen.queryByText(/Peran demo/i)).not.toBeInTheDocument()
})

test("dekan melihat antrean dengan jumlahnya, breadcrumb, dan identitasnya", async () => {
  const client = createMockClient({ latencyMs: 0 })
  await loginAs(client, "dekan.fmipa@unila.ac.id")
  const expected = (await client.listQueue()).length
  expect(expected).toBeGreaterThan(0)
  await renderApp("/ikhtisar", { client })
  const crumb = await findBreadcrumb()
  expect(crumb).toHaveTextContent("UnilaMSP")
  expect(crumb).toHaveTextContent("FMIPA")
  const link = screen.getAllByRole("link", { name: /Antrean pengesahan/ })[0]
  await waitFor(() => expect(link).toHaveTextContent(String(expected)))
  expect(screen.getAllByText("dekan-fmipa@UnilaMSP")[0]).toBeInTheDocument()
  expect(screen.queryByRole("link", { name: /Catat SKPI/ })).not.toBeInTheDocument()
})

test("keluar kembali ke halaman masuk", async () => {
  const { user } = await renderApp("/ikhtisar", { as: "rektor@unila.ac.id" })
  await findBreadcrumb()
  await user.click(screen.getAllByRole("button", { name: "Keluar" })[0])
  expect(await screen.findByRole("heading", { name: "Masuk ke Sistem Pengesahan SKPI" })).toBeInTheDocument()
})

test("sesi kedaluwarsa (401) mengembalikan ke halaman masuk", async () => {
  const { user, client } = await renderApp("/ikhtisar", { as: "dekan.fmipa@unila.ac.id" })
  await findBreadcrumb()
  await client.logout() // sesi berakhir di server
  await user.click(screen.getAllByRole("link", { name: /Daftar & riwayat/ })[0])
  expect(await screen.findByRole("heading", { name: "Masuk ke Sistem Pengesahan SKPI" })).toBeInTheDocument()
})

test("akar mengarah ke portal verifikasi publik", async () => {
  await renderApp("/")
  expect(await screen.findByRole("heading", { name: /Periksa keabsahan SKPI/ })).toBeInTheDocument()
})
