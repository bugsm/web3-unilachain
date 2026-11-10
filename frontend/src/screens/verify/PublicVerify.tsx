import { useState, type FormEvent } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { ArrowRight, Lock } from "lucide-react"
import type { Tone } from "@/domain/status"
import { useApi } from "@/app/ApiProvider"
import { useAsync } from "@/app/useAsync"
import { Badge, Button, Field, Input } from "@/components/ui"
import { LoadError } from "@/components/ui/LoadError"
import { normalizeName, normalizeNpm } from "@/domain/skpi"
import { Candidates } from "./Candidates"
import { PublicLayout } from "./PublicLayout"

const SAMPLES = [
  { label: "Terdaftar", q: "2017051008" },
  { label: "Dicabut", q: "2017051042" },
  { label: "Belum sah", q: "2017051056" },
  { label: "Nama ganda", q: "Rizky Maulana" },
]

const CHECKS = [
  ["Identitas lulusan", "NPM dan nama tercatat di ledger."],
  ["Dua tanda tangan", "Dekan fakultas penerbit dan Rektor telah mengesahkan SKPI."],
  ["Status terkini", "SKPI masih berlaku, sedang menunggu pengesahan, atau telah dicabut."],
]

const LEGEND: Array<[Tone, string, string]> = [
  ["ok", "Terdaftar", "SKPI disahkan Dekan dan Rektor, dan masih berlaku."],
  ["pending", "Belum sah", "SKPI sudah disahkan Dekan tetapi masih menunggu Rektor; belum dapat dijadikan bukti."],
  ["revoked", "Dicabut", "SKPI pernah sah, tetapi telah dicabut oleh universitas."],
  ["muted", "Tidak terdaftar", "NPM tidak ditemukan sebagai SKPI di ledger, atau masih berupa draft."],
]

const INVALID = "Masukkan minimal 3 huruf nama atau 10 digit NPM."

export function PublicVerify() {
  const api = useApi()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get("q") ?? ""
  const [value, setValue] = useState(q)
  const [error, setError] = useState<string | undefined>()
  const search = useAsync(() => (q ? api.searchPublic(q) : Promise.resolve(null)), [api, q])

  function submit(e: FormEvent) {
    e.preventDefault()
    const npm = normalizeNpm(value)
    const name = normalizeName(value)
    if (/^\d+$/.test(npm)) {
      if (npm.length !== 10) return setError(INVALID)
      setError(undefined)
      return navigate(`/verifikasi/${npm}`)
    }
    if (name.length < 3) return setError(INVALID)
    setError(undefined)
    setParams({ q: name })
  }

  return (
    <PublicLayout>
      <section className="grid grid-cols-12 gap-6 py-12 sm:py-16 lg:py-24">
        <div className="col-span-12 lg:col-span-6">
          <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">Verifikasi publik · tanpa akun</p>
          <h1 className="mt-5 text-[36px] leading-[1.05] font-semibold tracking-[-0.035em] text-slate-900 sm:text-[44px] lg:text-[56px]">
            Periksa keabsahan SKPI lulusan Universitas Lampung.
          </h1>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-slate-500">
            Masukkan NPM atau nama lengkap yang tercetak pada dokumen yang Anda terima. Status dibaca langsung dari ledger UnilaMSP,
            bukan dari salinan dokumen.
          </p>
          <ol className="mt-12 max-w-lg border-t border-slate-200">
            {CHECKS.map(([title, desc], i) => (
              <li key={title} className="grid grid-cols-[40px_1fr] gap-3 border-b border-slate-200 py-4 text-[15px]">
                <span className="font-mono text-xs leading-6 text-slate-400 tabular-nums">0{i + 1}</span>
                <p className="text-slate-600">
                  <span className="font-semibold text-slate-900">{title}</span> {desc}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="col-span-12 lg:col-span-5 lg:col-start-8">
          <form onSubmit={submit} noValidate className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-6 sm:p-8 lg:mt-10">
            <p className="text-sm font-semibold text-slate-900">Data dari dokumen</p>
            <p className="mt-1 text-sm text-slate-500">Isi NPM atau nama lengkap lulusan sesuai dokumen.</p>
            <div className="mt-7">
              <Field label="NPM atau nama lulusan" error={error} hint="NPM 10 digit memberi hasil paling tepat.">
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Contoh: 2017051008 atau Nabila Azzahra"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-11 bg-white"
                />
              </Field>
            </div>
            <Button type="submit" variant="primary" size="lg" className="mt-7 w-full" loading={search.loading && !!q} loadingLabel="Mencari…">
              Verifikasi dokumen <ArrowRight size={16} />
            </Button>
            <p className="mt-5 flex items-center gap-2 text-xs text-slate-500">
              <Lock size={13} /> Kueri hanya-baca; dibatasi jumlah permintaan per menit.
            </p>
            {import.meta.env.DEV && import.meta.env.VITE_API_MODE === "mock" && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <p className="text-xs text-slate-500">Data uji untuk demo</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SAMPLES.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => {
                        setValue(s.q)
                        setError(undefined)
                      }}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-[scale,border-color] duration-150 hover:border-slate-300 active:scale-[0.97]"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>

          {q && search.error !== undefined && (
            <div className="mt-6">
              <LoadError error={search.error} onRetry={search.reload} />
            </div>
          )}
          {q && search.data && <Candidates q={q} candidates={search.data.candidates} truncated={search.data.truncated} />}
        </div>
      </section>

      <section className="border-t border-slate-200 py-12">
        <div className="grid grid-cols-12 gap-6">
          <h2 className="col-span-12 text-sm font-semibold text-slate-900 lg:col-span-3">Cara membaca hasil</h2>
          <dl className="col-span-12 divide-y divide-slate-200 border-y border-slate-200 lg:col-span-9">
            {LEGEND.map(([tone, label, desc]) => (
              <div key={label} className="grid grid-cols-12 items-center gap-4 py-4">
                <dt className="col-span-12 sm:col-span-3">
                  <Badge tone={tone}>{label}</Badge>
                </dt>
                <dd className="col-span-12 text-sm text-slate-600 sm:col-span-9">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </PublicLayout>
  )
}
