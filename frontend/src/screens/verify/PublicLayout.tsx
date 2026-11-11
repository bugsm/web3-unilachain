import type { ReactNode } from "react"
import { PublicNav } from "@/components/PublicNav"

/** `band`: pita gelap (LedgerBand, sudah memuat navigasi) di atas isi; tanpa itu navigasi terang biasa. */
export function PublicLayout({ children, band }: { children: ReactNode; band?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      {band ?? <PublicNav />}
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 sm:px-10 lg:px-20 print:max-w-none print:p-0">{children}</main>
      <footer className="border-t border-line pb-[env(safe-area-inset-bottom)] print:hidden">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-5 text-label text-slate-500 sm:px-10 lg:px-20">
          <span>© Universitas Lampung · Biro Akademik dan Kemahasiswaan</span>
          <span className="font-mono">Hyperledger Fabric · skpi-channel · UnilaMSP</span>
        </div>
      </footer>
    </div>
  )
}
