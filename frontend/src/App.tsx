import { useState, type ReactNode } from "react"
import { BrowserRouter } from "react-router"
import { Toaster } from "sonner"
import type { ApiClient } from "@/api/client"
import { createDefaultClient } from "@/api"
import { AppRoutes } from "@/app/router"
import { SessionProvider } from "@/app/session"

export function AppProviders({ client, children }: { client: ApiClient; children: ReactNode }) {
  return (
    <SessionProvider client={client}>
      {children}
      <Toaster
        position="bottom-right"
        offset={24}
        toastOptions={{
          classNames: {
            toast: "!rounded-lg !border-0 !bg-[#0F172A] !text-white !shadow-xl !font-sans",
            description: "!text-slate-300",
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
