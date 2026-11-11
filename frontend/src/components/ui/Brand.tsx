import { cx } from "./cx"

export function Logo({ className }: { className?: string }) {
  return <img src="/logo-unila.png" alt="Logo Universitas Lampung" className={cx("size-full object-contain", className)} />
}

export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cx("grid size-10 shrink-0 place-items-center rounded-lg bg-white p-1", !dark && "ring-1 ring-line")}
      >
        <Logo />
      </span>
      <span className="text-left leading-tight">
        <span className={cx("block text-[15px] font-semibold", dark ? "text-white" : "text-ink")}>SKPI Ledger</span>
        <span className={cx("block text-xs", dark ? "text-slate-400" : "text-slate-500")}>Universitas Lampung</span>
      </span>
    </div>
  )
}
