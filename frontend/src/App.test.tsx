import { render, screen } from "@testing-library/react"
import { createMockClient } from "@/api/mock/mockClient"
import App from "./App"

test("aplikasi utuh merender portal verifikasi di akar", async () => {
  window.history.pushState({}, "", "/")
  render(<App client={createMockClient({ latencyMs: 0 })} />)
  expect(await screen.findByRole("heading", { name: /Periksa keabsahan SKPI/ })).toBeInTheDocument()
})
