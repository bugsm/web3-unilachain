import { screen, waitFor, within } from "@testing-library/react"
import { createMockClient } from "@/api/mock/mockClient"
import type { RecordStatus } from "@/api/types"
import { findBreadcrumb, loginAs, renderApp } from "@/test/renderApp"

async function seeded(email: string) {
  const client = createMockClient({ latencyMs: 0 })
  await loginAs(client, email)
  return client
}

test("rektor: hitungan per tahap sesuai data dan tahapnya ditandai", async () => {
  const client = await seeded("rektor@unila.ac.id")
  const records = await client.listRecords()
  const count = (...s: RecordStatus[]) => String(records.filter((r) => s.includes(r.status)).length)
  await renderApp("/ikhtisar", { client })
  const stages = await screen.findByRole("region", { name: "Status SKPI per tahap" })
  const card = (name: RegExp) => within(stages).getByRole("button", { name })
  await waitFor(() => expect(card(/Menunggu Dekan/)).toHaveTextContent(count("MENUNGGU_DEKAN")))
  expect(card(/Menunggu Rektor/)).toHaveTextContent(count("MENUNGGU_REKTOR"))
  expect(card(/Menunggu Rektor/)).toHaveTextContent("Tahap Anda")
  expect(card(/^Aktif/)).toHaveTextContent(count("AKTIF"))
  expect(card(/Dicabut/)).toHaveTextContent(count("DICABUT"))
  expect(card(/Ditolak/)).toHaveTextContent(count("DITOLAK_DEKAN", "DITOLAK_REKTOR"))
})

test("admin: tabel ditolak berisi alasan dan hanya fakultasnya", async () => {
  await renderApp("/ikhtisar", { as: "admin.fmipa@unila.ac.id" })
  const table = await screen.findByRole("region", { name: "Ditolak · perlu perbaikan" })
  expect(await within(table).findByText("Dimas Arya Saputra")).toBeInTheDocument()
  expect(within(table).getByText(/Nomor SKPI tidak sesuai dengan dokumen fisik/)).toBeInTheDocument()
  expect(screen.queryByText("Andi Wijaya")).not.toBeInTheDocument()
  // Sidebar + tombol aksi halaman.
  expect(screen.getAllByRole("link", { name: /Catat SKPI/ })).toHaveLength(2)
})

test("dekan: tombol buka antrean memuat jumlah antrean", async () => {
  const client = await seeded("dekan.fmipa@unila.ac.id")
  const n = (await client.listQueue()).length
  await renderApp("/ikhtisar", { client })
  expect(await screen.findByRole("link", { name: `Buka antrean (${n})` })).toBeInTheDocument()
  const table = screen.getByRole("region", { name: "Menunggu tanda tangan Anda" })
  expect(await within(table).findByText("Aulia Rahmawati")).toBeInTheDocument()
  expect(within(table).getAllByText("Perubahan").length).toBeGreaterThan(0)
})

test("aktivitas: off-chain tanpa hash, ledger dengan hash", async () => {
  await renderApp("/ikhtisar", { as: "rektor@unila.ac.id" })
  const feed = await screen.findByRole("region", { name: "Aktivitas" })
  const items = await within(feed).findAllByRole("listitem")
  expect(items).toHaveLength(7)
  const off = items.filter((li) => li.textContent?.includes("off-chain"))
  const onLedger = items.filter((li) => !li.textContent?.includes("off-chain"))
  expect(off.length).toBeGreaterThan(0)
  for (const li of off) expect(within(li).queryByRole("button", { name: /hash/i })).toBeNull()
  for (const li of onLedger) expect(within(li).getByRole("button", { name: "Salin hash transaksi" })).toBeInTheDocument()
})

test("klik kartu Aktif membuka daftar dengan filter", async () => {
  const { user } = await renderApp("/ikhtisar", { as: "rektor@unila.ac.id" })
  const stages = await screen.findByRole("region", { name: "Status SKPI per tahap" })
  await user.click(within(stages).getByRole("button", { name: /^Aktif/ }))
  expect(await findBreadcrumb()).toHaveTextContent("Daftar & riwayat")
})
