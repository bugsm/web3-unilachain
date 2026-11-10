import { useEffect, useRef, useState } from "react"
import { Check, Copy } from "lucide-react"
import { shortHash } from "@/domain/format"
import { cx } from "./cx"

export function Hash({ value, full = false }: { value: string; full?: boolean }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const icon = "[grid-area:1/1] transition-[opacity,scale] duration-150 ease-out-ui"
  return (
    <span className="inline-flex max-w-full items-start gap-1.5 font-mono text-xs text-slate-600 tabular-nums">
      <span title={value} className={full ? "break-all" : ""}>
        {full ? value : shortHash(value)}
      </span>
      <button
        type="button"
        aria-label={copied ? "Hash transaksi disalin" : "Salin hash transaksi"}
        className="-mt-0.5 grid shrink-0 place-items-center rounded p-0.5 text-slate-400 transition-[scale,color] duration-150 hover:bg-slate-100 hover:text-slate-700 active:scale-[0.9]"
        onClick={(e) => {
          e.stopPropagation()
          navigator.clipboard?.writeText(value).catch(() => undefined)
          setCopied(true)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => setCopied(false), 1400)
        }}
      >
        {/* Ikon bertumpuk dan crossfade, bukan bongkar-pasang. */}
        <Copy size={13} aria-hidden className={cx(icon, copied ? "scale-[0.8] opacity-0" : "scale-100 opacity-100")} />
        <Check
          size={13}
          aria-hidden
          className={cx(icon, "text-[#059669]", copied ? "scale-100 opacity-100" : "scale-[0.8] opacity-0")}
        />
      </button>
    </span>
  )
}
