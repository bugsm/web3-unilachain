import type { ReactNode } from "react"
import { PublicNav } from "@/components/PublicNav"

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicNav />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 sm:px-6 lg:px-10">{children}</main>
      <footer className="border-t border-slate-200 pb-[env(safe-area-inset-bottom)] print:hidden">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4 text-xs text-slate-500 sm:px-6 lg:px-10">
          <span>© Universitas Lampung</span>
          <span className="font-mono">Hyperledger Fabric · skpi-channel</span>
        </div>
      </footer>
    </div>
  )
}
