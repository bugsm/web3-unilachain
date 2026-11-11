import type { ReactNode } from "react"
import { PublicNav } from "./PublicNav"
import { cx } from "./ui/cx"

/**
 * Pita gelap bersama untuk halaman masuk, portal verifikasi, dan hasil verifikasi.
 * Satu wrap (1280, gutter 20/40/80) untuk navigasi dan isi, sehingga tepi kiri semua halaman segaris.
 * `full`: mengisi satu layar penuh (hero sendirian di layar pertama).
 */
export function LedgerBand({
  full = false,
  as: Inner = "div",
  foot,
  children,
}: {
  full?: boolean
  as?: "div" | "main"
  foot?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={cx("ground-ledger relative isolate flex flex-col text-white print:hidden", full && "min-h-dvh")}>
      <PublicNav tone="dark" />
      <Inner className="relative mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-5 sm:px-10 lg:px-20">{children}</Inner>
      {foot && (
        <div className="relative mx-auto flex w-full max-w-[1280px] flex-wrap justify-between gap-x-6 gap-y-1 px-5 pb-6 text-label text-white/40 sm:px-10 lg:px-20">
          {foot}
        </div>
      )}
    </div>
  )
}

/**
 * Hero dua kolom: teks (6 kolom) dan panel (5 kolom, mulai kolom 8), tegak di tengah sisa layar.
 * `extra`: tambahan khusus mode mock di bawah panel; di desktop diletakkan di luar alur agar tata letak
 * dev dan production identik.
 */
export function HeroSplit({
  text,
  panel,
  extra,
  panelFirstOnMobile = false,
}: {
  text: ReactNode
  panel: ReactNode
  extra?: ReactNode
  panelFirstOnMobile?: boolean
}) {
  return (
    <div className="grid flex-1 items-center gap-12 pt-6 pb-14 lg:grid-cols-12 lg:gap-6 lg:pt-4 lg:pb-16">
      <div className={cx("lg:col-span-6", panelFirstOnMobile && "order-2 lg:order-1")}>{text}</div>
      <div className={cx("relative lg:col-span-5 lg:col-start-8", panelFirstOnMobile && "order-1 lg:order-2")}>
        {panel}
        {extra && <div className="mt-5 lg:absolute lg:inset-x-0 lg:top-full">{extra}</div>}
      </div>
    </div>
  )
}
