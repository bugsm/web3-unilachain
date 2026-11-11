import { useChainStatus, type ChainState } from "@/app/useChainStatus"
import { cx } from "./ui/cx"

const LABEL: Record<ChainState, string> = {
  checking: "Memeriksa…",
  online: "Tersambung",
  offline: "Terputus",
}

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" })
export const formatBlock = (n: number) => `#${n.toLocaleString("id-ID")}`

function Dot({ state }: { state: ChainState }) {
  return (
    <span className="relative flex size-2 shrink-0" aria-hidden>
      {state === "online" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-30 [animation-duration:2.4s]" />}
      <span
        className={cx(
          "relative inline-flex size-2 rounded-full",
          state === "online" ? "bg-ok" : state === "offline" ? "bg-bad" : "bg-slate-400",
        )}
      />
    </span>
  )
}

/**
 * Indikator rantai: tersambung atau tidak, dan nomor blok terbaru dari `/ledger/info`.
 * `detailed` untuk panel (halaman masuk, sidebar); bentuk ringkas untuk header.
 */
export function ChainStatus({ tone = "light", detailed = false, className }: { tone?: "light" | "dark"; detailed?: boolean; className?: string }) {
  const { state, info, latestBlock, lastCheck } = useChainStatus()
  const dark = tone === "dark"
  const muted = dark ? "text-white/55" : "text-slate-500"
  const strong = dark ? "text-white" : "text-ink"
  const showBlock = state === "online" && latestBlock !== null

  if (detailed)
    return (
      <div role="status" aria-label="Status blockchain" aria-live="polite" className={cx("text-[13px]", className)}>
        <p className={muted}>Jaringan Hyperledger Fabric</p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
          <span className={cx("flex items-center gap-2 text-[15px] font-medium", strong)}>
            <Dot state={state} />
            {LABEL[state]}
          </span>
          {showBlock && (
            <span className={cx("font-mono text-[15px] whitespace-nowrap tabular-nums", strong)}>
              <span className={cx("mr-1.5 font-sans text-[13px]", muted)}>Blok terbaru</span>
              {formatBlock(latestBlock)}
            </span>
          )}
        </div>
        <p className={cx("mt-1 font-mono text-[12px] tabular-nums", muted)}>
          {info?.channel ?? "skpi-channel"}
          {state === "offline" && latestBlock !== null && ` · terakhir diketahui ${formatBlock(latestBlock)}`}
          {lastCheck && ` · diperiksa ${timeFmt.format(lastCheck)}`}
        </p>
      </div>
    )

  return (
    <div
      role="status"
      aria-label="Status blockchain"
      aria-live="polite"
      title={info ? `${info.channel} · ${info.msp}${lastCheck ? ` · diperiksa ${timeFmt.format(lastCheck)}` : ""}` : undefined}
      className={cx(
        "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[12.5px] whitespace-nowrap",
        dark ? "border-white/15 text-white/80" : "border-line bg-white text-slate-600",
        className,
      )}
    >
      <Dot state={state} />
      <span className={cx("font-medium", strong, showBlock && "max-sm:sr-only")}>{LABEL[state]}</span>
      {showBlock && (
        <>
          <span aria-hidden className={cx("max-sm:hidden", dark ? "text-white/30" : "text-slate-300")}>
            ·
          </span>
          <span className="font-mono tabular-nums">
            <span className="max-sm:sr-only">Blok </span>
            {formatBlock(latestBlock)}
          </span>
        </>
      )}
    </div>
  )
}
