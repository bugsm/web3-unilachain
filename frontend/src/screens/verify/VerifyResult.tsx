import { useEffect, useState, type CSSProperties } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeft, Ban, CircleCheck, Clock3, Printer, SearchX } from "lucide-react"
import type { VerifyStatus } from "@/api/types"
import { isLedgerDown } from "@/api/errors"
import { useApi } from "@/app/ApiProvider"
import { useAsync } from "@/app/useAsync"
import { useChainStatus } from "@/app/useChainStatus"
import { formatBlock } from "@/components/ChainStatus"
import { LedgerBand } from "@/components/LedgerHero"
import { LedgerUnavailable } from "@/components/LedgerUnavailable"
import { LinkButton, cx } from "@/components/ui"
import { LoadError } from "@/components/ui/LoadError"
import { formatDateTime } from "@/domain/format"
import { normalizeNpm } from "@/domain/skpi"
import { PublicLayout } from "./PublicLayout"
import { VerifyPrint } from "./VerifyPrint"

/* Warna status di latar gelap: cukup terang untuk 4.5:1 di atas tinta hitam hangat. */
const OUTCOME: Record<VerifyStatus, { label: string; icon: typeof CircleCheck; chip: string; text: string }> = {
  TERDAFTAR: {
    label: "Terdaftar",
    icon: CircleCheck,
    chip: "bg-[#3ccf8e]/12 text-[#5fdca4] ring-[#3ccf8e]/30",
    text: "SKPI ini tercatat di ledger dan telah disahkan Dekan fakultas penerbit serta Rektor. Cocokkan data di bawah dengan dokumen yang Anda terima.",
  },
  DICABUT: {
    label: "Dicabut",
    icon: Ban,
    chip: "bg-[#f0566a]/12 text-[#ff8a99] ring-[#f0566a]/30",
    text: "SKPI ini pernah sah, tetapi telah dicabut dan tidak lagi berlaku. Jangan gunakan dokumen ini sebagai bukti kompetensi.",
  },
  BELUM_SAH: {
    label: "Belum sah",
    icon: Clock3,
    chip: "bg-gold/12 text-gold ring-gold/30",
    text: "SKPI sedang menunggu pengesahan Rektor dan belum dapat dijadikan bukti.",
  },
  TIDAK_TERDAFTAR: {
    label: "Tidak terdaftar",
    icon: SearchX,
    chip: "bg-white/8 text-white/70 ring-white/15",
    text: "NPM ini tidak ditemukan sebagai SKPI yang sah di ledger Universitas Lampung.",
  },
}

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties

/** Waktu dan blok saat hasil diterima: dibekukan untuk layar dan lembar cetak. */
function useCheckSnapshot(key: unknown) {
  const { latestBlock } = useChainStatus()
  const [snap, setSnap] = useState<{ key: unknown; at: string; block: number | null } | null>(null)
  useEffect(() => {
    if (key === undefined) return
    setSnap((s) => (s?.key === key ? s : { key, at: new Date().toISOString(), block: latestBlock }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => {
    if (latestBlock !== null) setSnap((s) => (s && s.block === null ? { ...s, block: latestBlock } : s))
  }, [latestBlock])
  return snap
}

export function VerifyResult() {
  const api = useApi()
  const npm = normalizeNpm(useParams().npm ?? "")
  const result = useAsync(() => api.verify(npm), [api, npm])
  const data = result.data
  const snap = useCheckSnapshot(data)
  const o = data ? OUTCOME[data.status] : null
  const skpi = data?.data ?? null
  const url = `${window.location.origin}/verifikasi/${npm}`

  const hero = (
    <section className="pt-4 pb-14 lg:pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
          <Link to="/verifikasi" className="text-white/55 transition-colors hover:text-white">
            Verifikasi
          </Link>
          <span className="text-white/25">/</span>
          <span className="font-mono text-white/90">{npm}</span>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/verifikasi"
            className="inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-sm text-white/70 transition-colors hover:bg-white/8 hover:text-white"
          >
            <ArrowLeft size={15} /> Verifikasi lain
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!data}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-ink transition-[translate,background-color] duration-150 ease-out-ui hover:-translate-y-px hover:bg-white/90 active:translate-y-0 disabled:opacity-40"
          >
            <Printer size={15} /> Cetak hasil
          </button>
        </div>
      </div>

      {result.error !== undefined && !result.loading && (
        isLedgerDown(result.error) ? (
          <LedgerUnavailable onRetry={result.reload} className="mt-10 max-w-3xl" />
        ) : (
          <div className="mt-10 max-w-2xl rounded-2xl bg-white p-1 text-ink">
            <LoadError error={result.error} onRetry={result.reload} />
          </div>
        )
      )}
      {result.loading && !data && (
        <p aria-busy="true" className="mt-14 text-body text-white/55">
          Membaca status dari ledger…
        </p>
      )}

      {data && o && snap && (
        <div key={`${npm}-${data.status}`} className="mt-12 grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-6">
          <div className="lg:col-span-7">
            <span className={cx("enter inline-flex size-12 items-center justify-center rounded-2xl ring-1", o.chip)}>
              <o.icon size={24} strokeWidth={2} />
            </span>
            <p className="enter mt-6 text-sm text-white/55" style={d(60)}>
              Status SKPI di ledger
            </p>
            <h1 className="display enter mt-2 text-display-md leading-none sm:text-display-xl" style={d(100)}>
              {o.label}
            </h1>
            <p className="enter mt-6 max-w-[540px] text-lead leading-relaxed text-white/65" style={d(160)}>
              {o.text}
            </p>
            {data.status === "DICABUT" && (
              <p className="enter mt-3 text-body font-medium text-[#ff8a99]" style={d(200)}>
                Hubungi Universitas Lampung untuk keterangan pencabutan.
              </p>
            )}
          </div>
          <dl
            className="enter grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3 lg:col-span-5 lg:grid-cols-1"
            style={d(200)}
          >
            {(
              [
                ["NPM yang diperiksa", npm, true],
                ["Diperiksa pada", formatDateTime(snap.at), false],
                ["Blok terbaru saat diperiksa", snap.block !== null ? formatBlock(snap.block) : "—", true],
              ] as const
            ).map(([k, v, mono]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 bg-ink-2 px-4 py-3.5 sm:block sm:px-5 lg:flex">
                <dt className="text-label text-white/50">{k}</dt>
                <dd className={cx("text-right text-body text-white sm:mt-1 sm:text-left lg:mt-0 lg:text-right", mono && "font-mono tabular-nums")}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  )

  return (
    <PublicLayout band={<LedgerBand>{hero}</LedgerBand>}>
      {data && (
        <div className="pt-14 pb-20 print:hidden">
          {skpi ? (
            <div className="grid gap-10 lg:grid-cols-12 lg:gap-6">
              <section className="lg:col-span-7">
                <h2 className="display text-title text-ink">Cocokkan dengan dokumen</h2>
                <p className="mt-2 text-body text-slate-600">Setiap data harus sama dengan yang tercetak pada SKPI.</p>
                <table aria-label="Metadata SKPI" className="mt-6 w-full border-t border-ink text-body">
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
                        ["Waktu terbit", formatDateTime(skpi.issuedTimestamp), false],
                      ] as const
                    ).map(([k, v, mono]) => (
                      <tr key={k} className="border-b border-line">
                        <th scope="row" className="w-40 py-3.5 pr-4 text-left align-top font-normal text-slate-500 sm:w-48">
                          {k}
                        </th>
                        <td className={cx("py-3.5 font-medium break-words text-ink", mono && "font-mono text-sm tabular-nums")}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section aria-labelledby="penanda-tangan" className="lg:col-span-5">
                <h2 id="penanda-tangan" className="display text-title text-ink">
                  Penanda tangan
                </h2>
                <p className="mt-2 text-body text-slate-600">Dua pengesahan, masing-masing dengan sertifikat X.509.</p>
                <ol className="mt-6 border-t border-ink">
                  {[
                    { step: "Tahap 1 · Dekan", name: data.dekanName, role: skpi.issuer, at: skpi.issuedTimestamp },
                    { step: "Tahap 2 · Rektor", name: data.rektorName ?? "Rektor Universitas Lampung", role: null, at: skpi.rektorTimestamp },
                  ].map((s) => (
                    <li key={s.step} className="grid grid-cols-[20px_1fr] gap-3 border-b border-line py-4">
                      <span aria-hidden className="mt-1.5 size-2.5 rounded-full border-2 border-gold-ink" />
                      <div>
                        <p className="text-label text-slate-500">{s.step}</p>
                        <p className="mt-1 font-medium text-ink">{s.name ?? s.role}</p>
                        {s.name && s.role && <p className="mt-0.5 text-sm text-slate-600">{s.role}</p>}
                        {s.at && <p className="mt-1 text-label text-slate-500 tabular-nums">{formatDateTime(s.at)}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-label leading-relaxed text-slate-500">
                  Tanda tangan tersimpan di ledger kanal <span className="font-mono">skpi-channel</span> (UnilaMSP). Nama pejabat diambil dari
                  tabel periode jabatan berdasarkan waktu pengesahan.
                </p>
              </section>
            </div>
          ) : (
            <section className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <h2 className="display text-title text-ink">Langkah berikutnya</h2>
              </div>
              <ul className="divide-y divide-line border-y border-ink lg:col-span-6">
                {[
                  "Periksa kembali NPM (10 digit) tepat seperti yang tercetak pada dokumen, atau cari dengan nama lengkap.",
                  "SKPI yang belum disahkan Rektor belum dapat diverifikasi sebagai sah.",
                  "Bila data sudah benar, hubungi bagian akademik Universitas Lampung untuk konfirmasi.",
                ].map((t) => (
                  <li key={t} className="py-4 text-body text-slate-600">
                    {t}
                  </li>
                ))}
              </ul>
              <div className="lg:col-span-2 lg:text-right">
                <LinkButton to="/verifikasi" variant="primary">
                  Coba lagi
                </LinkButton>
              </div>
            </section>
          )}
          <p className="mt-12 text-label text-slate-500">
            Hasil ini memverifikasi data SKPI di ledger, bukan menggantikan dokumen resmi. Gunakan “Cetak hasil” untuk lembar bukti
            pemeriksaan satu halaman.
          </p>
        </div>
      )}

      {data && snap && <VerifyPrint npm={npm} result={data} checkedAt={snap.at} latestBlock={snap.block} url={url} />}
    </PublicLayout>
  )
}
