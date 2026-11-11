import { screen, within } from "@testing-library/react"
import { createMockClient, DEMO_PASSWORD } from "@/api/mock/mockClient"
import { findBreadcrumb, renderApp } from "@/test/renderApp"

const heading = () => screen.findByRole("heading", { name: "Masuk ke Sistem Pengesahan SKPI" })

test("kirim kosong menampilkan galat", async () => {
  const { user } = await renderApp("/masuk")
  await heading()
  await user.click(screen.getByRole("button", { name: /Masuk & Akses Konsol/ }))
  expect(screen.getByText("Email, NIP, atau NIDN wajib diisi.")).toBeInTheDocument()
  expect(screen.getByText("Kata sandi wajib diisi.")).toBeInTheDocument()
})

test("peran default Admin Fakultas dan panah kanan berpindah ke Dekan", async () => {
  const { user } = await renderApp("/masuk")
  await heading()
  const group = screen.getByRole("radiogroup", { name: "Peran" })
  const admin = within(group).getByRole("radio", { name: "Admin Fakultas" })
  expect(admin).toBeChecked()
  admin.focus()
  await user.keyboard("{ArrowRight}")
  expect(within(group).getByRole("radio", { name: "Dekan" })).toBeChecked()
  expect(within(group).getByRole("radio", { name: "Dekan" })).toHaveFocus()
})

async function fill(user: Awaited<ReturnType<typeof renderApp>>["user"], email: string, role: string) {
  await user.click(screen.getByRole("radio", { name: role }))
  await user.type(screen.getByLabelText(/Email \/ NIP \/ NIDN/), email)
  await user.type(screen.getByLabelText("Kata sandi"), DEMO_PASSWORD)
}

test("login dekan menuju ikhtisar", async () => {
  const { user } = await renderApp("/masuk")
  await heading()
  await fill(user, "dekan.fmipa@unila.ac.id", "Dekan")
  await user.click(screen.getByRole("button", { name: /Masuk & Akses Konsol/ }))
  const crumb = await findBreadcrumb()
  expect(crumb).toHaveTextContent("Ikhtisar")
})

test("peran salah menampilkan pesan dan tetap di halaman masuk", async () => {
  const { user } = await renderApp("/masuk")
  await heading()
  await fill(user, "dekan.fmipa@unila.ac.id", "Rektor")
  await user.click(screen.getByRole("button", { name: /Masuk & Akses Konsol/ }))
  expect(await screen.findByText("Akun ini tidak memegang peran tersebut. Pilih peran yang sesuai.")).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Masuk ke Sistem Pengesahan SKPI" })).toBeInTheDocument()
})

test("sandi salah memakai pesan server", async () => {
  const { user } = await renderApp("/masuk")
  await heading()
  await user.type(screen.getByLabelText(/Email \/ NIP \/ NIDN/), "admin.fmipa@unila.ac.id")
  await user.type(screen.getByLabelText("Kata sandi"), "salah-sekali")
  await user.click(screen.getByRole("button", { name: /Masuk & Akses Konsol/ }))
  expect(await screen.findByText("Email atau kata sandi salah.")).toBeInTheDocument()
})

test("klik ganda hanya memanggil login sekali", async () => {
  const client = createMockClient({ latencyMs: 30 })
  const spy = vi.spyOn(client, "login")
  const { user } = await renderApp("/masuk", { client })
  await heading()
  await fill(user, "admin.fmipa@unila.ac.id", "Admin Fakultas")
  const btn = screen.getByRole("button", { name: /Masuk & Akses Konsol/ })
  await user.dblClick(btn)
  expect(btn).toHaveAttribute("aria-busy", "true")
  expect(spy).toHaveBeenCalledTimes(1)
  await findBreadcrumb()
})

test("?next mengembalikan ke halaman tujuan", async () => {
  const { user } = await renderApp("/masuk?next=%2Fdaftar")
  await heading()
  await fill(user, "rektor@unila.ac.id", "Rektor")
  await user.click(screen.getByRole("button", { name: /Masuk & Akses Konsol/ }))
  expect(await findBreadcrumb()).toHaveTextContent("Daftar & riwayat")
})

test("?next ke situs luar diabaikan", async () => {
  const { user } = await renderApp("/masuk?next=%2F%2Fevil.example")
  await heading()
  await fill(user, "rektor@unila.ac.id", "Rektor")
  await user.click(screen.getByRole("button", { name: /Masuk & Akses Konsol/ }))
  expect(await findBreadcrumb()).toHaveTextContent("Ikhtisar")
})
