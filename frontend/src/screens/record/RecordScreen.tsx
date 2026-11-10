import { useState } from "react"
import { useSearchParams } from "react-router"
import { PageHeader, cx } from "@/components/ui"
import { normalizeNpm } from "@/domain/skpi"
import { BatchForm } from "./BatchForm"
import { Receipt, type Submitted } from "./Receipt"
import { SingleForm } from "./SingleForm"

export function RecordScreen() {
  const [params] = useSearchParams()
  const [mode, setMode] = useState<"single" | "batch">("single")
  const [receipt, setReceipt] = useState<Submitted[] | null>(null)
  const [round, setRound] = useState(0)

  if (receipt)
    return (
      <Receipt
        created={receipt}
        onAgain={() => {
          setReceipt(null)
          setRound((r) => r + 1)
        }}
      />
    )

  return (
    <>
      <PageHeader
        eyebrow="Draft off-chain"
        title="Ajukan SKPI ke Dekan"
        description="Draft disimpan di basis data aplikasi dan belum masuk blockchain. Data baru tercatat di ledger setelah Dekan menyetujui."
        actions={
          <div className="inline-flex rounded-lg border border-slate-200 bg-[#F8FAFC] p-1" role="tablist" aria-label="Mode pencatatan">
            {(["single", "batch"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cx(
                  "h-8 rounded-md px-4 text-sm font-semibold transition-colors duration-150",
                  mode === m ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900",
                )}
              >
                {m === "single" ? "Satuan" : "Batch (CSV)"}
              </button>
            ))}
          </div>
        }
      />
      {mode === "single" ? (
        <SingleForm key={round} initialNpm={round ? "" : normalizeNpm(params.get("npm") ?? "")} onDone={setReceipt} />
      ) : (
        <BatchForm onDone={setReceipt} />
      )}
    </>
  )
}
