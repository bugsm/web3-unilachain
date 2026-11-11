import { act, render, screen } from "@testing-library/react"
import { ApiError } from "@/api/errors"
import { createMockClient } from "@/api/mock/mockClient"
import { ApiProvider } from "@/app/ApiProvider"
import { ChainStatusProvider, POLL_MS } from "@/app/useChainStatus"
import { ChainStatus } from "./ChainStatus"

const block = (height: number) => `Blok #${(height - 1).toLocaleString("id-ID")}`

function setup(client = createMockClient({ latencyMs: 0 })) {
  render(
    <ApiProvider client={client}>
      <ChainStatusProvider>
        <ChainStatus />
      </ChainStatusProvider>
    </ApiProvider>,
  )
  return client
}

const flush = () => act(async () => {})

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

test("tersambung menampilkan blok terbaru (height - 1)", async () => {
  const client = setup()
  const { height } = await client.ledgerInfo()
  const status = await screen.findByRole("status", { name: "Status blockchain" })
  expect(status).toHaveTextContent("Tersambung")
  expect(status).toHaveTextContent(block(height))
})

test("sebelum jawaban pertama: memeriksa", async () => {
  const client = createMockClient({ latencyMs: 0 })
  vi.spyOn(client, "ledgerInfo").mockReturnValue(new Promise(() => undefined))
  setup(client)
  expect(screen.getByRole("status", { name: "Status blockchain" })).toHaveTextContent("Memeriksa")
})

test("gagal setelah sempat tersambung → terputus, blok lama tidak ditampilkan sebagai tersambung", async () => {
  const client = createMockClient({ latencyMs: 0 })
  setup(client)
  const status = await screen.findByRole("status", { name: "Status blockchain" })
  await vi.waitFor(() => expect(status).toHaveTextContent("Tersambung"))
  client.setChainOnline(false)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS)
  })
  expect(status).toHaveTextContent("Terputus")
  expect(status).not.toHaveTextContent("Tersambung")
})

test("blok bertambah saat ada transaksi baru, terlihat pada polling berikutnya", async () => {
  const client = createMockClient({ latencyMs: 0 })
  setup(client)
  const status = await screen.findByRole("status", { name: "Status blockchain" })
  const { height } = await client.ledgerInfo()
  await vi.waitFor(() => expect(status).toHaveTextContent(block(height)))
  await client.login({ identifier: "rektor@unila.ac.id", password: "skpi-demo-2026" })
  const [first] = await client.listQueue()
  if (first.kind !== "rektor") throw new Error("seed berubah")
  await client.rektorApprove(first.record.npm)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS)
  })
  expect(status).toHaveTextContent(block(height + 1))
})

test("tab kembali terlihat memicu pemeriksaan segera; tab tersembunyi tidak polling", async () => {
  const client = createMockClient({ latencyMs: 0 })
  const spy = vi.spyOn(client, "ledgerInfo")
  setup(client)
  await flush()
  expect(spy).toHaveBeenCalledTimes(1)
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
  })
  expect(spy).toHaveBeenCalledTimes(1)
  hidden.mockReturnValue(false)
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"))
  })
  expect(spy).toHaveBeenCalledTimes(2)
})

test("galat jaringan dari klien http juga dianggap terputus", async () => {
  const client = createMockClient({ latencyMs: 0 })
  vi.spyOn(client, "ledgerInfo").mockRejectedValue(new ApiError(0, "NETWORK", "x"))
  setup(client)
  const status = screen.getByRole("status", { name: "Status blockchain" })
  await vi.waitFor(() => expect(status).toHaveTextContent("Terputus"))
})
