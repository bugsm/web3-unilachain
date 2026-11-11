import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import type { ApiClient } from "@/api/client"
import { createMockClient, DEMO_PASSWORD } from "@/api/mock/mockClient"
import { AppProviders } from "@/App"
import { AppRoutes } from "@/app/router"

export async function loginAs(client: ApiClient, email: string) {
  await client.logout()
  return client.login({ identifier: email, password: DEMO_PASSWORD })
}

/** Render aplikasi utuh di atas klien tiruan tanpa latensi. */
export async function renderApp(path: string, opts: { client?: ApiClient; as?: string } = {}) {
  const client = opts.client ?? createMockClient({ latencyMs: 0 })
  if (opts.as) await loginAs(client, opts.as)
  const user = userEvent.setup()
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders client={client}>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  )
  return { ...utils, user, client }
}

/** Tunggu halaman staf selesai memuat sesi. */
export const findBreadcrumb = () => screen.findByRole("navigation", { name: "Breadcrumb" })
