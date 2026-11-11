import { screen } from "@testing-library/react"
import { createMockClient, DEMO_PASSWORD } from "@/api/mock/mockClient"
import { findBreadcrumb, renderApp } from "@/test/renderApp"

const heading = () => screen.findByRole("heading", { name: "Masuk ke Sistem Pengesahan SKPI" })
const submit = () => screen.getByRole("button", { name: "Masuk" })

test("kirim kosong menampilkan galat", async () => {
  const { user } = await renderApp("/masuk")
  await heading()
  await user.click(submit())
  expect(screen.getByText("Email, NIP, atau NIDN wajib diisi.")).toBeInTheDocument()
  expect(screen.getByText("Kata sandi wajib diisi.")).toBeInTheDocument()
})

test("satu portal: tidak ada pilihan peran", async () => {
  await renderApp("/masuk")
  await heading()
  expect(screen.queryByRole("radiogroup")).toBeNull()
  expect(screen.queryByRole("radio")).toBeNull()
})

async function fill(user: Awaited<ReturnType<typeof renderApp>>["user"], email: string) {
  await user.type(screen.getByLabelText(/Email \/ NIP \/ NIDN/), email)
  await user.type(screen.getByLabelText("Kata sandi"), DEMO_PASSWORD)
}

test.each([
  ["admin.fmipa@unila.ac.id", "Ikhtisar"],
  ["dekan.fmipa@unila.ac.id", "Antrean pengesahan"],
  ["rektor@unila.ac.id", "Antrean pengesahan"],
])("%s diarahkan otomatis ke %s", async (email, page) => {
  const { user } = await renderApp("/masuk")
  await heading()
  await fill(user, email)
  await user.click(submit())
  expect(await findBreadcrumb()).toHaveTextContent(page)
})

test("sandi salah memakai pesan server", async () => {
  const { user } = await renderApp("/masuk")
  await heading()
  await user.type(screen.getByLabelText(/Email \/ NIP \/ NIDN/), "admin.fmipa@unila.ac.id")
  await user.type(screen.getByLabelText("Kata sandi"), "salah-sekali")
  await user.click(submit())
  expect(await screen.findByText("Email atau kata sandi salah.")).toBeInTheDocument()
})

test("klik ganda hanya memanggil login sekali", async () => {
  const client = createMockClient({ latencyMs: 30 })
  const spy = vi.spyOn(client, "login")
  const { user } = await renderApp("/masuk", { client })
  await heading()
  await fill(user, "admin.fmipa@unila.ac.id")
  const btn = submit()
  await user.dblClick(btn)
  expect(btn).toHaveAttribute("aria-busy", "true")
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy).toHaveBeenCalledWith({ identifier: "admin.fmipa@unila.ac.id", password: DEMO_PASSWORD })
  await findBreadcrumb()
})

test("?next mengembalikan ke halaman tujuan", async () => {
  const { user } = await renderApp("/masuk?next=%2Fdaftar")
  await heading()
  await fill(user, "rektor@unila.ac.id")
  await user.click(submit())
  expect(await findBreadcrumb()).toHaveTextContent("Daftar & riwayat")
})

test("?next ke situs luar diabaikan, tujuan mengikuti peran", async () => {
  const { user } = await renderApp("/masuk?next=%2F%2Fevil.example")
  await heading()
  await fill(user, "rektor@unila.ac.id")
  await user.click(submit())
  expect(await findBreadcrumb()).toHaveTextContent("Antrean pengesahan")
})

test("sudah masuk lalu membuka /masuk diarahkan ke beranda perannya", async () => {
  await renderApp("/masuk", { as: "dekan.fmipa@unila.ac.id" })
  expect(await findBreadcrumb()).toHaveTextContent("Antrean pengesahan")
})
