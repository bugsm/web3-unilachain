import { useState, type ReactNode } from "react"
import { BrowserRouter } from "react-router"
import { Toaster } from "sonner"
import type { ApiClient } from "@/api/client"
import { createDefaultClient } from "@/api"
import { AppRoutes } from "@/app/router"
import { SessionProvider } from "@/app/session"
import { ChainStatusProvider } from "@/app/useChainStatus"

export function AppProviders({ client, children }: { client: ApiClient; children: ReactNode }) {
  return (
    <SessionProvider client={client}>
      <ChainStatusProvider>{children}</ChainStatusProvider>
      <Toaster
        position="bottom-right"
        offset={24}
        toastOptions={{
          classNames: {
            toast: "!rounded-lg !border-0 !bg-ink !text-white !shadow-xl !font-sans",
            description: "!text-white/70",
          },
        }}
      />
    </SessionProvider>
  )
}

export default function App({ client }: { client?: ApiClient }) {
  const [api] = useState(() => client ?? createDefaultClient())
  return (
    <BrowserRouter>
      <AppProviders client={api}>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  )
}
