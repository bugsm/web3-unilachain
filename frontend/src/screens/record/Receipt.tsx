import { ArrowRight, Check } from "lucide-react"
import { CustodySteps } from "@/components/Custody"
import { Button, LinkButton, SectionTitle, StatusBadge } from "@/components/ui"

export interface Submitted {
  npm: string
  name: string
  skpiId: string
}

export function Receipt({ created, onAgain }: { created: Submitted[]; onAgain: () => void }) {
  const first = created[0]
  return (
    <div className="grid grid-cols-12 gap-6">
      <section className="col-span-12 lg:col-span-7">
        {/* Muncul sekali per pengajuan: ikon masuk dengan scale+opacity, bukan dari nol. */}
        <span className="grid size-11 place-items-center rounded-full bg-ok-soft text-ok transition-[opacity,scale] duration-300 ease-out-ui starting:scale-90 starting:opacity-0">
          <Check size={22} strokeWidth={3} />
        </span>
        <p className="mt-6 text-label font-semibold text-ink">Draft off-chain</p>
        <h1 className="mt-3 display text-title text-ink">
          {created.length > 1 ? `${created.length} draft diajukan ke Dekan.` : "Draft diajukan ke Dekan."}
        </h1>
        <p className="mt-3 max-w-xl text-body leading-relaxed text-slate-500">
          Draft tersimpan di basis data aplikasi dan belum masuk ledger. Data tercatat di blockchain setelah Dekan menyetujui,
          lalu dapat diverifikasi publik setelah Rektor mengesahkan.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton to="/daftar?status=PENDING" variant="primary">
            Lihat di daftar <ArrowRight size={16} />
          </LinkButton>
          <Button onClick={onAgain}>Catat lagi</Button>
        </div>
      </section>
      <section className="col-span-12 overflow-hidden rounded-2xl border border-line bg-white shadow-card lg:col-span-5">
        <SectionTitle title="Ringkasan draft" aside={<StatusBadge status="MENUNGGU_DEKAN" />} />
        {created.length === 1 ? (
          <div className="space-y-5 p-5">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Lulusan</dt>
                <dd className="text-right font-semibold text-ink">{first.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">NPM</dt>
                <dd className="font-mono text-xs tabular-nums">{first.npm}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Nomor SKPI</dt>
                <dd className="font-mono text-xs tabular-nums">{first.skpiId}</dd>
              </div>
            </dl>
            <div className="border-t border-line pt-5">
              <CustodySteps status="MENUNGGU_DEKAN" />
            </div>
          </div>
        ) : (
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {created.map((r) => (
              <li key={r.npm} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
                  <p className="font-mono text-xs text-slate-500 tabular-nums">{r.npm}</p>
                </div>
                <span className="font-mono text-xs text-slate-500 tabular-nums">{r.skpiId}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
