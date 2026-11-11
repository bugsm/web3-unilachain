import { useRef, useState, type CSSProperties, type FormEvent } from "react"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router"
import { ArrowRight, Eye, EyeOff, TriangleAlert } from "lucide-react"
import { userMessage } from "@/api/errors"
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/api/mock/mockClient"
import { homeOf, safeNext } from "@/app/home"
import { useSession } from "@/app/session"
import { HeroSplit, LedgerBand } from "@/components/LedgerHero"
import { SigningFlow } from "@/components/SigningFlow"
import { Button, cx } from "@/components/ui"

type IdKind = "EMAIL" | "NIP" | "NIDN" | null

function detectKind(v: string): IdKind {
  const s = v.trim()
  if (!s) return null
  if (s.includes("@")) return "EMAIL"
  const digits = s.replace(/\s/g, "")
  if (/^\d+$/.test(digits)) return digits.length > 10 ? "NIP" : "NIDN"
  return null
}

function validateId(v: string): string | undefined {
  const s = v.trim()
  if (!s) return "Email, NIP, atau NIDN wajib diisi."
  const kind = detectKind(s)
  if (kind === "EMAIL") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? undefined : "Format email tidak valid."
  const digits = s.replace(/\s/g, "")
  if (kind === "NIP" && digits.length !== 18) return "NIP harus 18 digit."
  if (kind === "NIDN" && digits.length !== 10) return "NIDN harus 10 digit."
  if (!kind) return "Gunakan email institusi, NIP 18 digit, atau NIDN 10 digit."
  return undefined
}

const ROLE_LABEL = { admin: "Admin fakultas", dekan: "Dekan", rektor: "Rektor" } as const

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties

const inputCls = (invalid: boolean) =>
  cx(
    "h-12 w-full rounded-xl border bg-white px-4 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 focus:ring-[3px]",
    invalid ? "border-bad focus:border-bad focus:ring-bad/15" : "border-slate-300 hover:border-slate-400 focus:border-ink focus:ring-ink/10",
  )

export function Login() {
  const { user, login } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get("next"))
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [caps, setCaps] = useState(false)
  const [errors, setErrors] = useState<{ id?: string; password?: string }>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const busy = useRef(false)

  // Sudah masuk: langsung ke tujuan (tanpa menunggu submit).
  if (user && !loading) return <Navigate to={next ?? homeOf(user.role)} replace />

  const kind = detectKind(identifier)
  const numeric = kind === "NIP" || kind === "NIDN"

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return
    const nextErrors = {
      id: validateId(identifier),
      password: password.length === 0 ? "Kata sandi wajib diisi." : password.length < 8 ? "Kata sandi minimal 8 karakter." : undefined,
    }
    setErrors(nextErrors)
    setServerError(null)
    if (nextErrors.id || nextErrors.password) return
    busy.current = true
    setLoading(true)
    try {
      const u = await login({ identifier: identifier.trim(), password })
      navigate(next ?? homeOf(u.role), { replace: true })
    } catch (err) {
      setServerError(userMessage(err))
      setLoading(false)
    } finally {
      busy.current = false
    }
  }

  const text = (
    <>
      <p className="enter inline-flex h-7 items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 text-[13px] text-white/70">
        <span aria-hidden className="size-1.5 rounded-full bg-gold" />
        Biro Akademik dan Kemahasiswaan
      </p>
      <p className="display enter mt-6 text-[40px] leading-[1.04] sm:text-[52px] lg:text-[58px]" style={delay(80)}>
        Pengesahan SKPI, dari draft fakultas sampai tanda tangan Rektor.
      </p>
      <p className="enter mt-6 max-w-[540px] text-[17px] leading-relaxed text-white/60" style={delay(160)}>
        Admin menyusun draft, Dekan dan Rektor menandatanganinya dengan sertifikat masing-masing. Setiap tanda tangan masuk ke ledger
        dan bisa diperiksa siapa pun lewat portal verifikasi.
      </p>
      <SigningFlow className="enter mt-10" />
    </>
  )

  const panel = (
    <div
      className="enter rounded-[20px] bg-white p-7 text-ink shadow-[0_40px_100px_-30px_rgb(0_0_0/0.7),0_0_0_1px_rgb(255_255_255/0.08)] sm:p-9"
      style={delay(120)}
    >
      <form onSubmit={submit} noValidate>
        <h1 className="display text-[28px] leading-[1.1]">Masuk ke Sistem Pengesahan SKPI</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          Satu akun untuk semua jabatan. Halaman kerja dibuka sesuai jabatan pada akun Anda.
        </p>

        <div className="mt-8">
          <label htmlFor="login-id" className="mb-2 flex items-center justify-between text-[13px] font-medium text-ink">
            Email / NIP / NIDN
            {kind && <span className="font-mono text-[12px] font-normal text-slate-500">{kind}</span>}
          </label>
          <input
            id="login-id"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value)
              if (errors.id) setErrors((p) => ({ ...p, id: undefined }))
            }}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            inputMode={numeric ? "numeric" : "email"}
            placeholder="nama@unila.ac.id"
            aria-invalid={!!errors.id}
            aria-describedby={errors.id ? "login-id-err" : undefined}
            className={cx(inputCls(!!errors.id), numeric && "font-mono")}
          />
          {errors.id && (
            <p id="login-id-err" className="mt-2 text-[13px] text-bad">
              {errors.id}
            </p>
          )}
        </div>

        <div className="mt-5">
          <label htmlFor="login-pw" className="mb-2 block text-[13px] font-medium text-ink">
            Kata sandi
          </label>
          <div className="relative">
            <input
              id="login-pw"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (errors.password) setErrors((p) => ({ ...p, password: undefined }))
              }}
              onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
              onBlur={() => setCaps(false)}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "login-pw-err" : undefined}
              className={cx(inputCls(!!errors.password), "pr-14")}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
              aria-pressed={show}
              className="absolute top-1/2 right-1.5 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-canvas hover:text-ink"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password ? (
            <p id="login-pw-err" className="mt-2 text-[13px] text-bad">
              {errors.password}
            </p>
          ) : (
            caps && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-warn">
                <TriangleAlert size={14} /> Caps Lock aktif
              </p>
            )
          )}
        </div>

        {serverError && (
          <p role="alert" className="mt-5 rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 text-[14px] text-bad">
            {serverError}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" loading={loading} loadingLabel="Memeriksa akun…" className="group mt-8 h-12 w-full rounded-xl text-[15px]">
          Masuk
          <ArrowRight size={17} className="transition-[translate] duration-150 ease-out-ui group-hover:translate-x-[3px]" />
        </Button>
      </form>
      <p className="mt-6 border-t border-line pt-5 text-[14px] text-slate-600">
        Memeriksa keaslian SKPI?{" "}
        <Link to="/verifikasi" className="font-medium text-ink underline decoration-slate-300 underline-offset-4 transition-colors hover:decoration-ink">
          Buka portal verifikasi
        </Link>
      </p>
    </div>
  )

  const demo =
    import.meta.env.DEV && import.meta.env.VITE_API_MODE === "mock" ? (
      <div className="text-[13px] text-white/55">
        <p>Akun demo (mode mock), sandi {DEMO_PASSWORD}</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                title={a.email}
                onClick={() => {
                  setIdentifier(a.email)
                  setPassword(DEMO_PASSWORD)
                  setErrors({})
                }}
                className="h-8 rounded-full border border-white/12 px-3 text-white/75 transition-colors hover:border-white/30 hover:text-white"
              >
                {ROLE_LABEL[a.role]} {a.faculty ?? ""}
              </button>
            </li>
          ))}
        </ul>
      </div>
    ) : undefined

  return (
    <LedgerBand
      full
      as="main"
      foot={
        <>
          <span>© Universitas Lampung</span>
          <span className="font-mono">Hyperledger Fabric · skpi-channel</span>
        </>
      }
    >
      <HeroSplit text={text} panel={panel} extra={demo} panelFirstOnMobile />
    </LedgerBand>
  )
}
