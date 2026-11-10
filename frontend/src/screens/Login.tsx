import { useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router"
import {
  ArrowRight,
  AtSign,
  Eye,
  EyeOff,
  Fingerprint,
  IdCard,
  KeyRound,
  Lock,
  PenLine,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"
import { userMessage } from "@/api/errors"
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/api/mock/mockClient"
import type { Role } from "@/api/types"
import { useSession } from "@/app/session"
import { Button, Logo, cx } from "@/components/ui"

interface RoleOption {
  id: Role
  label: string
  duty: string
  identity: string
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    id: "admin",
    label: "Admin Fakultas",
    duty: "Membuat draft SKPI fakultas",
    identity: "Admin fakultas tidak memegang identitas Fabric; draft disimpan off-chain.",
  },
  {
    id: "dekan",
    label: "Dekan",
    duty: "Tanda tangan tingkat fakultas",
    identity: "dekan-fmipa@UnilaMSP",
  },
  {
    id: "rektor",
    label: "Rektor",
    duty: "Tanda tangan final, SKPI aktif",
    identity: "rektor@UnilaMSP",
  },
]

const SEALS = [
  {
    icon: Fingerprint,
    name: "X.509 Cryptographic Identity",
    desc: "Dekan dan Rektor memegang sertifikat yang diterbitkan CA universitas.",
    spec: "UnilaMSP",
  },
  {
    icon: Lock,
    name: "Immutability",
    desc: "Riwayat hanya bertambah; tidak ada catatan yang dapat ditimpa.",
    spec: "append-only",
  },
  {
    icon: PenLine,
    name: "Pengesahan Bertingkat",
    desc: "Dekan lalu Rektor menandatangani dengan identitas X.509 masing-masing sebelum SKPI aktif.",
    spec: "2 tanda tangan",
  },
]

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

/** Hanya path internal; tolak //host dan URL absolut. */
function safeNext(v: string | null) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/ikhtisar"
}

const inputCls = (invalid: boolean) =>
  cx(
    "h-11 w-full rounded-lg border bg-white text-[15px] text-slate-900 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 focus:ring-4",
    invalid
      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100"
      : "border-slate-300 focus:border-[#2563EB] focus:ring-blue-100",
  )

export function Login() {
  const { user, login } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get("next"))
  const [role, setRole] = useState<Role>("admin")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [caps, setCaps] = useState(false)
  const [errors, setErrors] = useState<{ id?: string; password?: string }>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const busy = useRef(false)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  if (user && !loading) return <Navigate to={next} replace />

  const kind = detectKind(identifier)
  const current = ROLE_OPTIONS.find((o) => o.id === role)!

  function onRoleKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const n = (i + dir + ROLE_OPTIONS.length) % ROLE_OPTIONS.length
    setRole(ROLE_OPTIONS[n].id)
    tabRefs.current[n]?.focus()
  }

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
      await login({ identifier: identifier.trim(), password, role })
      navigate(next, { replace: true })
    } catch (err) {
      setServerError(userMessage(err))
      setLoading(false)
    } finally {
      busy.current = false
    }
  }

  return (
    <div className="grid min-h-dvh bg-[#F8FAFC] lg:grid-cols-[45fr_55fr]">
      <aside className="relative hidden overflow-hidden bg-[linear-gradient(165deg,#1E293B_0%,#0F172A_48%,#0A1020_100%)] text-white lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/10" />
        <div className="flex flex-1 flex-col px-14 pt-12 pb-10 xl:px-16">
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-white p-1.5">
              <Logo />
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold">Universitas Lampung</span>
              <span className="mt-0.5 block font-mono text-xs text-slate-400">Biro Akademik · UnilaMSP</span>
            </span>
          </div>

          <div className="mt-auto pt-16">
            <p className="max-w-[520px] text-[40px] leading-[1.08] font-semibold tracking-[-0.03em] xl:text-[46px]">
              Sistem Verifikasi &amp; Validasi SKPI Berbasis Blockchain
            </p>
            <p className="mt-5 max-w-[440px] text-[16px] leading-relaxed text-slate-300">
              Integritas Dokumen Akademik Berbasis Konsensus Hyperledger Fabric SmartBFT
            </p>
            <ul className="mt-14 border-t border-white/10">
              {SEALS.map((s) => (
                <li key={s.name} className="grid grid-cols-[36px_1fr_auto] items-start gap-4 border-b border-white/10 py-5">
                  <span className="grid size-9 place-items-center rounded-md border border-white/15 text-[#93C5FD]">
                    <s.icon size={17} strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="block text-[15px] font-medium">{s.name}</span>
                    <span className="mt-1 block max-w-[340px] text-[13px] leading-snug text-slate-400">{s.desc}</span>
                  </span>
                  <code className="pt-0.5 font-mono text-[11px] text-slate-500">{s.spec}</code>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-10 font-mono text-[11px] text-slate-500">skpi-channel · SmartBFT · 4 ordering node · 2 peer</p>
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:px-10">
        <div className="mb-8 flex w-full max-w-[480px] items-center gap-3 lg:hidden">
          <span className="grid size-11 place-items-center rounded-lg bg-white p-1 ring-1 ring-slate-200">
            <Logo />
          </span>
          <span className="text-sm leading-tight font-semibold text-slate-900">
            Sistem Verifikasi &amp; Validasi SKPI
            <span className="block font-normal text-slate-500">Universitas Lampung</span>
          </span>
        </div>

        <div className="w-full max-w-[480px] rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <form onSubmit={submit} noValidate className="px-6 pt-8 pb-7 sm:px-9">
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-slate-900">
              Masuk ke Sistem Pengesahan SKPI
            </h1>
            <p className="mt-2 text-[15px] text-slate-500">Pilih dan autentikasi peran Anda</p>

            <div className="mt-8">
              <div role="radiogroup" aria-label="Peran" className="grid grid-cols-3 gap-1 rounded-lg bg-[#F1F5F9] p-1">
                {ROLE_OPTIONS.map((o, i) => {
                  const active = o.id === role
                  return (
                    <button
                      key={o.id}
                      ref={(el) => {
                        tabRefs.current[i] = el
                      }}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      tabIndex={active ? 0 : -1}
                      onClick={() => setRole(o.id)}
                      onKeyDown={(e) => onRoleKey(e, i)}
                      className={cx(
                        // Pilihan peran: tanpa animasi posisi (sering dipakai keyboard); hanya warna.
                        "h-10 rounded-md text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
                        active
                          ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-slate-200"
                          : "text-slate-500 hover:text-slate-800",
                      )}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2.5 flex items-center justify-between gap-3 text-[13px]">
                <span className="text-slate-600">{current.duty}</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {ROLE_OPTIONS.indexOf(current) + 1} / 3
                </span>
              </p>
            </div>

            <div className="mt-7">
              <label htmlFor="login-id" className="mb-1.5 flex items-center justify-between text-[13px] font-medium text-slate-700">
                Email / NIP / NIDN
                {kind && <span className="font-mono text-[11px] font-normal tracking-wide text-slate-400">{kind}</span>}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400">
                  {kind === "NIP" || kind === "NIDN" ? <IdCard size={17} /> : <AtSign size={17} />}
                </span>
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
                  inputMode={kind === "NIP" || kind === "NIDN" ? "numeric" : "email"}
                  placeholder="nama@unila.ac.id atau NIP"
                  aria-invalid={!!errors.id}
                  aria-describedby={errors.id ? "login-id-err" : undefined}
                  className={cx(inputCls(!!errors.id), "pr-3 pl-10", (kind === "NIP" || kind === "NIDN") && "font-mono")}
                />
              </div>
              {errors.id && (
                <p id="login-id-err" className="mt-1.5 text-[13px] text-rose-600">
                  {errors.id}
                </p>
              )}
            </div>

            <div className="mt-5">
              <label htmlFor="login-pw" className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Kata sandi
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400">
                  <KeyRound size={17} />
                </span>
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
                  placeholder="Minimal 8 karakter"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "login-pw-err" : undefined}
                  className={cx(inputCls(!!errors.password), "pr-12 pl-10")}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  aria-pressed={show}
                  className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700"
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password ? (
                <p id="login-pw-err" className="mt-1.5 text-[13px] text-rose-600">
                  {errors.password}
                </p>
              ) : (
                caps && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-amber-700">
                    <TriangleAlert size={14} /> Caps Lock aktif
                  </p>
                )
              )}
            </div>

            <div className="mt-6 flex gap-3 border-l-2 border-[#1D4ED8] bg-[#F8FAFC] py-3 pr-3 pl-4">
              <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#1D4ED8]" />
              <div className="text-[13px] leading-snug text-slate-600">
                {role === "admin" ? (
                  current.identity
                ) : (
                  <>
                    Identitas kriptografis (X.509 MSP) didelegasikan secara aman untuk penandatanganan transaksi on-chain.
                    <span className="mt-1.5 block font-mono text-[11px] text-slate-500">{current.identity}</span>
                  </>
                )}
              </div>
            </div>

            {serverError && (
              <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-[#FFF1F2] px-4 py-3 text-[13px] text-rose-700">
                {serverError}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              loadingLabel="Memverifikasi sertifikat…"
              className="mt-6 h-12 w-full text-[15px]"
            >
              Masuk &amp; Akses Konsol <ArrowRight size={17} />
            </Button>
          </form>

          <div className="border-t border-slate-200 px-6 py-4 sm:px-9">
            <a
              href="/verifikasi"
              onClick={(e) => {
                e.preventDefault()
                navigate("/verifikasi")
              }}
              className="group flex w-full items-center justify-between gap-3 text-left text-[13px] font-medium text-slate-600 transition-colors duration-150 hover:text-[#1D4ED8]"
            >
              Akses Portal Verifikasi Publik untuk Pihak Luar (Tanpa Akun)
              <ArrowRight size={16} className="shrink-0 transition-[translate] duration-150 ease-out-ui group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>

        {import.meta.env.DEV && import.meta.env.VITE_API_MODE === "mock" && (
          <div className="mt-6 w-full max-w-[480px] rounded-lg border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-700">Akun demo (mode mock) · sandi {DEMO_PASSWORD}</p>
            <ul className="mt-2 space-y-1 font-mono">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email}>
                  {a.email} <span className="text-slate-400">· {a.role}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}
