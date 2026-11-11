import { useMemo } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeft, Ban, CircleCheck, Clock3, Printer, SearchX } from "lucide-react"
import type { VerifyStatus } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { useAsync } from "@/app/useAsync"
import { Badge, Button, LinkButton, cx } from "@/components/ui"
import { LoadError } from "@/components/ui/LoadError"
import { formatDateTime } from "@/domain/format"
import { normalizeNpm } from "@/domain/skpi"
import type { Tone } from "@/domain/status"
import { PublicLayout } from "./PublicLayout"

const OUTCOME: Record<VerifyStatus, { tone: Tone; label: string; icon: typeof CircleCheck; ring: string; text: string }> = {
  TERDAFTAR: {
    tone: "ok",
    label: "Terdaftar",
    icon: CircleCheck,
    ring: "bg-[#D1FAE5] text-[#059669]",
    text: "SKPI ini tercatat di ledger dan telah disahkan Dekan fakultas penerbit serta Rektor. Cocokkan metadata di bawah dengan dokumen yang Anda terima.",
  },
  DICABUT: {
    tone: "revoked",
    label: "Dicabut",
    icon: Ban,
    ring: "bg-[#FFE4E6] text-[#E11D48]",
    text: "SKPI ini pernah sah, tetapi telah dicabut dan tidak lagi berlaku. Jangan gunakan dokumen ini sebagai bukti kompetensi.",
  },
  BELUM_SAH: {
    tone: "pending",
    label: "Belum sah",
    icon: Clock3,
    ring: "bg-[#FEF3C7] text-[#D97706]",
    text: "SKPI sedang menunggu pengesahan Rektor dan belum dapat dijadikan bukti.",
  },
  TIDAK_TERDAFTAR: {
    tone: "muted",
    label: "Tidak terdaftar",
    icon: SearchX,
    ring: "bg-[#F1F5F9] text-[#64748B]",
    text: "NPM ini tidak ditemukan sebagai SKPI yang sah di ledger Universitas Lampung.",
  },
}

/* Hasil verifikasi jarang dibuka dan bersifat publik: boleh sedikit gerak. Ikon dulu, lalu bagian lain bertahap 40ms. */
const enter = "transition-[opacity,translate] duration-300 ease-out-ui starting:translate-y-1 starting:opacity-0"

export function VerifyResult() {
  const api = useApi()
  const npm = normalizeNpm(useParams().npm ?? "")
  const result = useAsync(() => api.verify(npm), [api, npm])
  const checkedAt = useMemo(() => new Date().toISOString(), [result.data])
  const data = result.data
  const o = data ? OUTCOME[data.status] : null
  const skpi = data?.data ?? null

  return (
    <PublicLayout>
      <div className="flex flex-wrap items-center justify-between gap-3 py-6 print:hidden">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
          <Link to="/verifikasi" className="text-slate-500 transition-colors hover:text-slate-900">
            Verifikasi
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-900">Hasil</span>
        </nav>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => window.print()} disabled={!data}>
            <Printer size={15} /> Cetak
          </Button>
          <LinkButton size="sm" to="/verifikasi">
            <ArrowLeft size={15} /> Verifikasi lain
          </LinkButton>
        </div>
      </div>

      {result.error !== undefined && !result.loading && (
        <div className="py-10">
          <LoadError error={result.error} onRetry={result.reload} />
        </div>
      )}
      {result.loading && !data && (
        <p aria-busy="true" className="border-y border-slate-200 py-16 text-center text-sm text-slate-500">
          Membaca world state…
        </p>
      )}

      {data && o && (
        <div key={`${npm}-${data.status}`}>
          <section className="grid grid-cols-12 gap-6 border-y border-slate-200 py-10">
            <div className="col-span-12 flex items-start gap-6 lg:col-span-8">
              <span className={cx("grid size-16 shrink-0 place-items-center rounded-2xl transition-[opacity,scale] duration-[250ms] ease-out-ui starting:scale-90 starting:opacity-0", o.ring)}>
                <o.icon size={30} strokeWidth={2} />
              </span>
              <div className={cx(enter, "delay-[40ms]")}>
                <Badge tone={o.tone}>{o.label}</Badge>
                <h1 className="mt-3 text-[40px] leading-none font-semibold tracking-[-0.035em] text-slate-900 sm:text-[48px]">{o.label}</h1>
                <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">{o.text}</p>
                {data.status === "DICABUT" && (
                  <p className="mt-3 text-sm font-medium text-[#BE123C]">Hubungi Universitas Lampung untuk keterangan pencabutan.</p>
                )}
              </div>
            </div>
            <dl className={cx(enter, "delay-[80ms] col-span-12 space-y-3 text-sm lg:col-span-4 lg:border-l lg:border-slate-200 lg:pl-8")}>
              <div>
                <dt className="text-xs text-slate-500">NPM yang diperiksa</dt>
                <dd className="mt-0.5 font-mono text-slate-900 tabular-nums">{npm}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Diperiksa pada</dt>
                <dd className="mt-0.5 text-slate-900 tabular-nums">{formatDateTime(checkedAt)}</dd>
              </div>
            </dl>
          </section>

          {skpi ? (
            <div className="mt-10 grid grid-cols-12 gap-6">
              <section className={cx(enter, "delay-[120ms] col-span-12 lg:col-span-7")}>
                <h2 className="text-sm font-semibold text-slate-900">Cocokkan dengan dokumen</h2>
                <p className="mt-1 text-sm text-slate-500">Setiap atribut harus sama dengan yang tercetak pada SKPI.</p>
                <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                  <table aria-label="Metadata SKPI" className="w-full text-sm">
                    <thead className="bg-[#F8FAFC]">
                      <tr>
                        <th className="h-10 w-40 px-5 text-left text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase sm:w-44">Atribut</th>
                        <th className="h-10 px-5 text-left text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Data di ledger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Nama lulusan", skpi.name, false],
                          ["NPM", skpi.npm, true],
                          ["Nomor SKPI", skpi.skpiId, true],
                          ["Program studi", skpi.programStudy, false],
                          ["Total SKP", String(skpi.totalSKP), true],
                          ["Predikat", skpi.predicate, false],
                          ["Penerbit", skpi.issuer, false],
                          ["Waktu terbit", formatDateTime(skpi.issuedTimestamp), true],
                        ] as const
                      ).map(([k, v, mono]) => (
                        <tr key={k} className="border-t border-slate-200">
                          <td className="px-5 py-3.5 text-slate-500">{k}</td>
                          <td className={cx("px-5 py-3.5 font-medium break-words text-slate-900", mono && "font-mono text-[13px] tabular-nums")}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside className={cx(enter, "delay-[160ms] col-span-12 lg:col-span-5")}>
                <section aria-labelledby="penanda-tangan" className="rounded-xl bg-[#0F172A] p-6 text-slate-300">
                  <h2 id="penanda-tangan" className="text-sm font-semibold text-white">
                    Penanda tangan
                  </h2>
                  <dl className="mt-5 space-y-5 text-sm">
                    <div>
                      <dt className="text-xs text-slate-400">Tahap 1 · Dekan</dt>
                      {data.dekanName && <dd className="mt-1 text-white">{data.dekanName}</dd>}
                      <dd className={data.dekanName ? "mt-0.5 text-xs text-slate-300" : "mt-1 text-white"}>{skpi.issuer}</dd>
                      <dd className="mt-0.5 text-xs text-slate-400 tabular-nums">{formatDateTime(skpi.issuedTimestamp)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Tahap 2 · Rektor</dt>
                      <dd className="mt-1 text-white">{data.rektorName ?? "Rektor Universitas Lampung"}</dd>
                      {skpi.rektorTimestamp && <dd className="mt-0.5 text-xs text-slate-400 tabular-nums">{formatDateTime(skpi.rektorTimestamp)}</dd>}
                    </div>
                    <div className="flex justify-between gap-4 border-t border-white/10 pt-4">
                      <dt>Organisasi</dt>
                      <dd className="font-mono text-xs text-white">UnilaMSP</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Kanal</dt>
                      <dd className="font-mono text-xs text-white">skpi-channel</dd>
                    </div>
                  </dl>
                  <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-relaxed text-slate-400">
                    Tanda tangan X.509 kedua pejabat tersimpan di blok ledger. Nama pejabat diambil dari tabel periode jabatan berdasarkan
                    waktu pengesahan.
                  </p>
                </section>
              </aside>
            </div>
          ) : (
            <section className={cx(enter, "delay-[120ms] mt-10 grid grid-cols-12 gap-6")}>
              <h2 className="col-span-12 text-sm font-semibold text-slate-900 lg:col-span-3">Langkah berikutnya</h2>
              <ol className="col-span-12 border-t border-slate-200 lg:col-span-7">
                {[
                  "Periksa kembali NPM (10 digit) tepat seperti yang tercetak pada dokumen, atau cari dengan nama lengkap.",
                  "SKPI yang belum disahkan Rektor belum dapat diverifikasi sebagai sah.",
                  "Bila data sudah benar, hubungi bagian akademik Universitas Lampung untuk konfirmasi.",
                ].map((t, i) => (
                  <li key={t} className="grid grid-cols-[40px_1fr] gap-3 border-b border-slate-200 py-4 text-[15px] text-slate-600">
                    <span className="font-mono text-xs leading-6 text-slate-400">0{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ol>
              <div className="col-span-12 lg:col-span-2 lg:text-right">
                <LinkButton to="/verifikasi" variant="primary">
                  Coba lagi
                </LinkButton>
              </div>
            </section>
          )}
          <p className="mt-10 mb-16 text-xs text-slate-500">
            Hasil ini memverifikasi metadata SKPI di ledger, bukan menggantikan dokumen resmi.
          </p>
        </div>
      )}
    </PublicLayout>
  )
}
