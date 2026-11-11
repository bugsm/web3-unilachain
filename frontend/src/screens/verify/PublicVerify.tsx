import { useState, type CSSProperties, type FormEvent } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { ArrowRight, Lock } from "lucide-react"
import type { Tone } from "@/domain/status"
import { useApi } from "@/app/ApiProvider"
import { useAsync } from "@/app/useAsync"
import { Badge, Button, Field, Input } from "@/components/ui"
import { LoadError } from "@/components/ui/LoadError"
import { normalizeName, normalizeNpm } from "@/domain/skpi"
import { HeroSplit, LedgerBand } from "@/components/LedgerHero"
import { VerifyFlow } from "@/components/SigningFlow"
import { Candidates } from "./Candidates"
import { PublicLayout } from "./PublicLayout"

const SAMPLES = [
  { label: "Terdaftar", q: "2017051008" },
  { label: "Dicabut", q: "2017051042" },
  { label: "Belum sah", q: "2017051056" },
  { label: "Nama ganda", q: "Rizky Maulana" },
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
  // Hasil disimpan bersama kuerinya: hasil kueri lama tidak pernah tampil di bawah kueri baru (saat memuat atau gagal).
  const search = useAsync(() => (q ? api.searchPublic(q).then((r) => ({ q, ...r })) : Promise.resolve(null)), [api, q])
  const current = search.data && search.data.q === q && !search.loading ? search.data : null

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
    // Nama sama dikirim ulang (mis. setelah 429): muat ulang, karena parameter URL tidak berubah.
    if (name === q) search.reload()
    else setParams({ q: name })
  }

  const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties

  const text = (
    <>
      <p className="enter inline-flex h-7 items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 text-[13px] text-white/70">
        <span aria-hidden className="size-1.5 rounded-full bg-gold" />
        Portal verifikasi publik, tanpa akun
      </p>
      <h1 className="display enter mt-6 text-[40px] leading-[1.04] sm:text-[52px] lg:text-[58px]" style={d(80)}>
        Periksa keabsahan SKPI lulusan Universitas Lampung.
      </h1>
      <p className="enter mt-6 max-w-[540px] text-[17px] leading-relaxed text-white/60" style={d(160)}>
        Masukkan NPM atau nama lengkap yang tercetak pada dokumen. Jawabannya dibaca langsung dari ledger, bukan dari salinan dokumen.
      </p>
      <VerifyFlow className="enter mt-10 max-sm:hidden" />
    </>
  )

  const panel = (
    <>
      <form
        onSubmit={submit}
        noValidate
        className="enter rounded-[20px] bg-white p-7 text-ink shadow-[0_40px_100px_-30px_rgb(0_0_0/0.7),0_0_0_1px_rgb(255_255_255/0.08)] sm:p-9"
        style={d(120)}
      >
        <p className="display text-[28px] leading-[1.1]">Data dari dokumen</p>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">Isi NPM atau nama lengkap lulusan sesuai dokumen.</p>
        <div className="mt-8">
          <Field label="NPM atau nama lulusan" error={error} hint="NPM 10 digit memberi hasil paling tepat.">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Contoh: 2017051008 atau Nabila Azzahra"
              autoComplete="off"
              spellCheck={false}
              className="h-12 rounded-xl px-4 text-[15px]"
            />
          </Field>
        </div>
        <Button type="submit" variant="primary" size="lg" className="group mt-8 h-12 w-full rounded-xl text-[15px]" loading={search.loading && !!q} loadingLabel="Mencari…">
          Verifikasi dokumen <ArrowRight size={17} className="transition-[translate] duration-150 ease-out-ui group-hover:translate-x-[3px]" />
        </Button>
        <p className="mt-6 flex items-center gap-2 border-t border-line pt-5 text-[14px] text-slate-600">
          <Lock size={14} className="shrink-0" /> Hanya membaca ledger, dibatasi per menit.
        </p>
      </form>

      {q && search.error !== undefined && (
        <div className="mt-4 rounded-2xl bg-white p-1 text-ink">
          <LoadError error={search.error} onRetry={search.reload} />
        </div>
      )}
      {current && <Candidates q={q} candidates={current.candidates} truncated={current.truncated} />}
    </>
  )

  const demo =
    import.meta.env.DEV && import.meta.env.VITE_API_MODE === "mock" ? (
      <div className="text-[13px] text-white/55">
        <p>Data uji untuk demo</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setValue(s.q)
                setError(undefined)
              }}
              className="h-8 rounded-full border border-white/12 px-3 text-white/75 transition-colors hover:border-white/30 hover:text-white"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    ) : undefined

  const band = (
    <LedgerBand
      full
      foot={
        <>
          <a href="#cara-membaca" className="transition-colors hover:text-white">
            Cara membaca hasil ↓
          </a>
          <span className="font-mono">Hyperledger Fabric · skpi-channel</span>
        </>
      }
    >
      <HeroSplit text={text} panel={panel} extra={demo} />
    </LedgerBand>
  )

  return (
    <PublicLayout band={band}>
      <section id="cara-membaca" className="scroll-mt-6 py-16 lg:py-20">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-4">
            <h2 className="display text-[28px] leading-tight text-ink">Cara membaca hasil</h2>
            <p className="mt-3 max-w-xs text-[15px] text-slate-600">Empat jawaban yang mungkin, langsung dari status SKPI di ledger.</p>
          </div>
          <dl className="col-span-12 divide-y divide-line border-y border-line lg:col-span-8">
            {LEGEND.map(([tone, label, desc]) => (
              <div key={label} className="grid grid-cols-12 items-center gap-4 py-4">
                <dt className="col-span-12 sm:col-span-3">
                  <Badge tone={tone}>{label}</Badge>
                </dt>
                <dd className="col-span-12 text-[15px] text-slate-600 sm:col-span-9">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </PublicLayout>
  )
}
