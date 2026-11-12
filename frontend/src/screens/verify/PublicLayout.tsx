import type { ReactNode } from "react"
import { PublicNav } from "@/components/PublicNav"
import { cx } from "@/components/ui/cx"

/**
 * `band`: pita gelap (LedgerBand, sudah memuat navigasi) di atas isi; tanpa itu navigasi terang biasa.
 * `fillBand`: pita mengisi seluruh sisa layar (halaman yang belum punya isi putih di bawahnya, mis. memuat atau galat),
 * sehingga tidak ada area putih kosong sebelum footer.
 */
export function PublicLayout({ children, band, fillBand = false }: { children: ReactNode; band?: ReactNode; fillBand?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white print:block print:min-h-0">
      {band && fillBand ? <div className="flex flex-1 flex-col [&>*]:flex-1">{band}</div> : (band ?? <PublicNav />)}
      <main className={cx("mx-auto w-full max-w-[1280px] px-5 sm:px-10 lg:px-20 print:max-w-none print:p-0", fillBand ? "flex-none" : "flex-1")}>
        {children}
      </main>
      <footer className="border-t border-line pb-[env(safe-area-inset-bottom)] print:hidden">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-5 text-label text-slate-500 sm:px-10 lg:px-20">
          <span>© Universitas Lampung · Biro Akademik dan Kemahasiswaan</span>
          <span className="font-mono">Hyperledger Fabric · skpi-channel · UnilaMSP</span>
        </div>
      </footer>
    </div>
  )
}
