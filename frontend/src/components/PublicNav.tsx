import { Link } from "react-router"
import { ChainStatus } from "./ChainStatus"
import { Logo } from "./ui/Brand"
import { cx } from "./ui/cx"

export function PublicNav({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dark = tone === "dark"
  return (
    <header className={cx("relative pt-[env(safe-area-inset-top)]", !dark && "border-b border-line bg-white")}>
      <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between gap-3 px-5 sm:px-10 lg:px-20">
        <Link to="/verifikasi" aria-label="Portal verifikasi SKPI" className="flex items-center gap-3">
          <span className={cx("grid size-10 shrink-0 place-items-center rounded-[10px] bg-white p-1", !dark && "ring-1 ring-line")}>
            <Logo />
          </span>
          <span className="leading-tight">
            <span className={cx("block text-[15px] font-medium", dark ? "text-white" : "text-ink")}>SKPI Ledger</span>
            <span className={cx("block text-[13px]", dark ? "text-white/50" : "text-slate-500")}>Universitas Lampung</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <ChainStatus tone={tone} />
        </div>
      </div>
    </header>
  )
}
