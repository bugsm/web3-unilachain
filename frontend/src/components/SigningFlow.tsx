import { useState } from "react"
import { useChainStatus } from "@/app/useChainStatus"
import { formatBlock } from "./ChainStatus"
import { cx } from "./ui/cx"

export interface FlowStep {
  who: string
  note: string
}

type Steps = [FlowStep, FlowStep, FlowStep]

/**
 * Rantai tiga langkah yang berakhir di ledger, dengan nomor blok langsung dari /ledger/info.
 * Denyut emas berjalan tiga kali (3,2 s) lalu berhenti; diulang saat pointer/fokus masuk ke kartu.
 */
export function LedgerFlow({ title, steps, className }: { title: string; steps: Steps; className?: string }) {
  const { state, latestBlock } = useChainStatus()
  const [run, setRun] = useState(0)
  const restart = () => setRun((r) => r + 1)

  return (
    <figure
      aria-label={title}
      onPointerEnter={restart}
      onFocus={restart}
      className={cx("relative overflow-hidden rounded-panel border border-white/10 bg-ink-2/80 px-6 pt-6 pb-7 backdrop-blur-sm sm:px-7", className)}
    >
      <p className="text-label font-medium text-white/80">{title}</p>

      {/* Tiga langkah + ledger = empat kolom; garis dari pusat kolom pertama ke pusat kolom terakhir. */}
      <ol className="relative mt-7 grid grid-cols-1 gap-5 sm:grid-cols-4 sm:gap-3">
        <div aria-hidden className="pointer-events-none absolute top-[7px] right-[12.5%] left-[12.5%] hidden h-px bg-white/15 sm:block">
          <div key={run} className="flow-pulse absolute inset-y-0 left-0 w-full">
            <span className="absolute top-1/2 left-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-glow" />
          </div>
        </div>

        {steps.map((s) => (
          <li key={s.who} className="relative flex items-start gap-3 sm:flex-col sm:items-center sm:gap-0 sm:text-center">
            <span aria-hidden className="relative z-10 mt-0.5 grid size-[15px] shrink-0 place-items-center rounded-full border border-white/25 bg-ink sm:mt-0">
              <span className="size-[5px] rounded-full bg-white/60" />
            </span>
            <span className="sm:mt-4">
              <span className="block text-sm font-medium text-white">{s.who}</span>
              <span className="mt-1 block text-label text-white/50">{s.note}</span>
            </span>
          </li>
        ))}

        <li className="relative flex items-start gap-3 sm:flex-col sm:items-center sm:gap-0 sm:text-center">
          <span aria-hidden className="relative z-10 mt-0.5 grid size-[15px] shrink-0 place-items-center rounded-full border border-gold/70 bg-ink sm:mt-0">
            <span className={cx("size-[5px] rounded-full", state === "offline" ? "bg-bad" : "bg-gold")} />
          </span>
          <span className="sm:mt-4">
            <span className="block text-sm font-medium text-gold">Ledger</span>
            <span className="mt-1 block overflow-hidden text-label text-white/80 tabular-nums">
              {state === "offline" ? (
                "Terputus"
              ) : latestBlock !== null ? (
                <span key={latestBlock} className="inline-block transition-[translate,opacity] duration-500 ease-out-ui starting:translate-y-full starting:opacity-0">
                  Blok {formatBlock(latestBlock)}
                </span>
              ) : (
                "Memeriksa…"
              )}
            </span>
          </span>
        </li>
      </ol>
    </figure>
  )
}

/** Alur pengesahan (halaman masuk staf). */
export const SigningFlow = ({ className }: { className?: string }) => (
  <LedgerFlow
    title="Alur pengesahan"
    className={className}
    steps={[
      { who: "Admin fakultas", note: "Menyusun draft" },
      { who: "Dekan", note: "Menandatangani" },
      { who: "Rektor", note: "Mengesahkan" },
    ]}
  />
)

/** Alur verifikasi (portal publik). */
export const VerifyFlow = ({ className }: { className?: string }) => (
  <LedgerFlow
    title="Alur verifikasi"
    className={className}
    steps={[
      { who: "Dokumen", note: "NPM atau nama" },
      { who: "Portal", note: "Tanpa akun" },
      { who: "Pencocokan", note: "Status SKPI" },
    ]}
  />
)
