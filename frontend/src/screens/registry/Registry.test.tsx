import { screen, waitFor, within } from "@testing-library/react"
import type { ApiClient } from "@/api/client"
import { createMockClient } from "@/api/mock/mockClient"
import { loginAs, renderApp } from "@/test/renderApp"

async function client(email: string) {
  const c = createMockClient({ latencyMs: 0 })
  await loginAs(c, email)
  return c
}

const drawer = () => screen.findByRole("dialog", { name: /Detail SKPI/ })

async function approvePendingChange(c: ApiClient, npm: string) {
  await loginAs(c, "dekan.fmipa@unila.ac.id")
  const item = (await c.listQueue()).find((q) => q.kind === "draft" && q.draft.npm === npm)
  if (item?.kind !== "draft") throw new Error("draft tidak ada")
  await c.approveDraft(item.draft.id)
}

test("tab status dengan hitungan, ?status memilih tab", async () => {
  const c = await client("admin.fmipa@unila.ac.id")
  const all = await c.listRecords()
  const revoked = await c.listRecords({ status: "DICABUT" })
  await renderApp("/daftar?status=DICABUT", { client: c })
  const tabs = await screen.findByRole("navigation", { name: "Filter status" })
  await waitFor(() => expect(within(tabs).getByRole("button", { name: /Semua/ })).toHaveTextContent(String(all.length)))
  expect(within(tabs).getByRole("button", { name: /Dicabut/ })).toHaveAttribute("aria-pressed", "true")
  const rows = screen.getAllByRole("row").slice(1)
  expect(rows).toHaveLength(revoked.length)
})

test("SKPI aktif dengan perubahan tertunda diberi penanda", async () => {
  await renderApp("/daftar", { as: "admin.fmipa@unila.ac.id" })
  const row = await screen.findByRole("row", { name: /2017051021/ })
  expect(within(row).getByText("Perubahan diajukan")).toBeInTheDocument()
})

test("drawer riwayat: transaksi ledger, peristiwa off-chain, ringkasan perubahan", async () => {
  const c = await client("admin.fmipa@unila.ac.id")
  await approvePendingChange(c, "2017051021")
  await loginAs(c, "admin.fmipa@unila.ac.id")
  await renderApp("/daftar/2017051021", { client: c })
  const d = await drawer()
  const history = await within(d).findByRole("list", { name: "Riwayat" })
  const items = within(history).getAllByRole("listitem")
  const find = (text: string) => items.find((li) => li.textContent?.includes(text))!
  expect(within(find("SahkanDekan")).getByRole("button", { name: "Salin hash transaksi" })).toBeInTheDocument()
  expect(find("SahkanDekan")).toHaveTextContent("dekan-fmipa@UnilaMSP")
  expect(within(find("SahkanRektor")).getByRole("button", { name: "Salin hash transaksi" })).toBeInTheDocument()
  expect(find("Diajukan admin")).toHaveTextContent("off-chain")
  expect(find("PerbaruiSKPI")).toHaveTextContent("Total SKP: 180 → 230")
})

test("admin pada SKPI aktif tanpa draft: ajukan perubahan & pencabutan", async () => {
  const { user, client: c } = await renderApp("/daftar/2017051008", { as: "admin.fmipa@unila.ac.id" })
  const d = await drawer()
  expect(await within(d).findByRole("button", { name: /Ajukan perubahan/ })).toBeInTheDocument()
  const spy = vi.spyOn(c, "createDraft")
  await user.click(within(d).getByRole("button", { name: /Ajukan pencabutan/ }))
  const modal = await screen.findByRole("dialog", { name: /Ajukan pencabutan SKPI Nabila Azzahra/ })
  const submit = within(modal).getByRole("button", { name: /Ajukan pencabutan/ })
  await user.type(within(modal).getByLabelText("Alasan pencabutan"), "Dokumen diterbitkan ulang dengan nomor baru")
  expect(submit).toBeDisabled()
  await user.type(within(modal).getByLabelText(/Ketik NPM 2017051008/), "2017051008")
  await user.click(submit)
  expect(await screen.findByText("Draft pencabutan diajukan ke Dekan")).toBeInTheDocument()
  expect(spy).toHaveBeenCalledWith({ type: "PENCABUTAN", npm: "2017051008", reason: "Dokumen diterbitkan ulang dengan nomor baru" })
})

test("admin pada SKPI aktif dengan draft tertunda: tanpa aksi baru", async () => {
  await renderApp("/daftar/2017051021", { as: "admin.fmipa@unila.ac.id" })
  const d = await drawer()
  expect(await within(d).findByText("Menunggu keputusan Dekan atas draft perubahan.")).toBeInTheDocument()
  expect(within(d).queryByRole("button", { name: /Ajukan perubahan/ })).toBeNull()
  expect(within(d).queryByRole("button", { name: /Ajukan pencabutan/ })).toBeNull()
})

test("admin memperbaiki draft yang ditolak dekan", async () => {
  const { user, client: c } = await renderApp("/daftar/2017051095", { as: "admin.fmipa@unila.ac.id" })
  const d = await drawer()
  const spy = vi.spyOn(c, "updateDraft")
  await user.click(await within(d).findByRole("button", { name: /Perbaiki & ajukan ulang/ }))
  const modal = await screen.findByRole("dialog", { name: "Perbaiki & ajukan ulang" })
  expect(within(modal).getByText(/Nomor SKPI tidak sesuai dengan dokumen fisik/)).toBeInTheDocument()
  const skpi = within(modal).getByLabelText("Nomor SKPI")
  await user.clear(skpi)
  await user.type(skpi, "018/UN26.17/SKPI/2026")
  await user.click(within(modal).getByRole("button", { name: /Ajukan ke Dekan/ }))
  await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
  expect((await c.getRecord("2017051095")).status).toBe("MENUNGGU_DEKAN")
})

test("admin pada SKPI dicabut: catat ulang membuka formulir dengan NPM", async () => {
  const { user } = await renderApp("/daftar/2017051042", { as: "admin.fmipa@unila.ac.id" })
  const d = await drawer()
  await user.click(await within(d).findByRole("link", { name: /Catat ulang/ }))
  expect(await screen.findByRole("heading", { name: "Ajukan SKPI ke Dekan" })).toBeInTheDocument()
  expect(screen.getByLabelText("NPM")).toHaveValue("2017051042")
})

test("dekan dan rektor hanya membaca", async () => {
  await renderApp("/daftar/2017051008", { as: "rektor@unila.ac.id" })
  const d = await drawer()
  expect(await within(d).findByText("Perubahan dan pencabutan diajukan oleh admin fakultas.")).toBeInTheDocument()
  expect(within(d).queryByRole("button", { name: /Ajukan/ })).toBeNull()
})
