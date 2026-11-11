import { useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react"
import { ArrowRight, ShieldCheck } from "lucide-react"
import { userMessage } from "@/api/errors"
import { useApi } from "@/app/ApiProvider"
import { useUser } from "@/app/session"
import { Button, Field, Input, SectionTitle, Select, cx } from "@/components/ui"
import { facultyByCode, type FacultyCode } from "@/domain/faculty"
import { predicateOf, predicateRange, toInput, validateSkpi, type SkpiForm } from "@/domain/skpi"
import type { Submitted } from "./Receipt"

const ALL: Record<keyof SkpiForm, boolean> = { npm: true, name: true, skpiId: true, programStudy: true, totalSKP: true }

export const emptyForm = (faculty: FacultyCode, npm = ""): SkpiForm => ({
  npm,
  name: "",
  skpiId: "",
  programStudy: facultyByCode(faculty).programs[0],
  totalSKP: "",
})

/** Predikat untuk pratinjau; null bila total belum berupa bilangan ≥ 25. */
export function draftPredicate(total: string) {
  const t = total.trim()
  return /^\d+$/.test(t) ? predicateOf(Number(t)) : null
}

export function FormGroup({ index, title, note, children }: { index: string; title: string; note: string; children: ReactNode }) {
  return (
    <fieldset className="grid grid-cols-12 gap-6 border-b border-line px-6 py-7 last-of-type:border-b-0">
      <legend className="sr-only">{title}</legend>
      <div className="col-span-12 md:col-span-4">
        <span className="font-mono text-xs text-slate-400 tabular-nums">{index}</span>
        <p className="mt-1 text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{note}</p>
      </div>
      <div className="col-span-12 grid gap-5 sm:grid-cols-2 md:col-span-8">{children}</div>
    </fieldset>
  )
}

export function SingleForm({ initialNpm, onDone }: { initialNpm: string; onDone: (s: Submitted[]) => void }) {
  const user = useUser()
  const api = useApi()
  const faculty = user.faculty!
  const fac = facultyByCode(faculty)
  const [form, setForm] = useState<SkpiForm>(() => emptyForm(faculty, initialNpm))
  const [touched, setTouched] = useState<Partial<Record<keyof SkpiForm, boolean>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const busy = useRef(false)
  const errors = useMemo(() => validateSkpi(form, faculty), [form, faculty])
  const err = (k: keyof SkpiForm) => (touched[k] ? errors[k] : undefined)
  const set = (k: keyof SkpiForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setServerError(null)
  }
  const blur = (k: keyof SkpiForm) => () => setTouched((t) => ({ ...t, [k]: true }))
  const predicate = draftPredicate(form.totalSKP)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(ALL)
    if (busy.current || Object.keys(errors).length) return
    busy.current = true
    setSubmitting(true)
    const { npm, ...data } = toInput(form)
    try {
      await api.createDraft({ type: "PENCATATAN", npm, data })
      onDone([{ npm, name: data.name, skpiId: data.skpiId }])
    } catch (err) {
      setServerError(userMessage(err))
      setSubmitting(false)
    } finally {
      busy.current = false
    }
  }

  const preview: Array<[string, string]> = [
    ["npm", form.npm.trim() || "—"],
    ["name", form.name.trim() || "—"],
    ["skpiId", form.skpiId.trim() || "—"],
    ["programStudy", form.programStudy],
    ["totalSKP", form.totalSKP.trim() || "—"],
    ["predicate", predicate ?? "—"],
    ["issuer", "diisi saat Dekan menyetujui"],
    ["issuedTimestamp", "diisi saat Dekan menyetujui"],
    ["status", "MENUNGGU_DEKAN (off-chain)"],
  ]

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-12 gap-6">
      <div className="col-span-12 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgb(12_10_8/0.04)] lg:col-span-8">
        <FormGroup index="01" title="Identitas lulusan" note="NPM menjadi kunci aset di world state. Digit ke-4 menunjukkan fakultas.">
          <Field label="NPM" error={err("npm")} hint="10 digit Nomor Pokok Mahasiswa">
            <Input
              value={form.npm}
              onChange={set("npm")}
              onBlur={blur("npm")}
              inputMode="numeric"
              autoComplete="off"
              maxLength={13}
              placeholder={`231${fac.npmDigit}051xxx`}
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Nama lulusan" error={err("name")} hint="Sesuai ijazah, maks. 100 karakter">
            <Input value={form.name} onChange={set("name")} onBlur={blur("name")} maxLength={100} placeholder="Sesuai dokumen SKPI" />
          </Field>
        </FormGroup>

        <FormGroup index="02" title="Fakultas" note="Mengikuti akun Anda. Penerbit (issuer) diisi dari sertifikat Dekan saat menyetujui.">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-slate-700">Fakultas penerbit</p>
            <p className="flex h-10 items-center rounded-lg border border-line bg-canvas px-3 font-mono text-sm text-slate-700">
              {faculty} · {fac.unitCode}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">{fac.name}</p>
          </div>
          <Field label="Program studi" error={err("programStudy")}>
            <Select value={form.programStudy} onChange={set("programStudy")} onBlur={blur("programStudy")}>
              {fac.programs.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
        </FormGroup>

        <FormGroup index="03" title="Dokumen SKPI" note="Nomor sesuai dokumen fisik. Waktu terbit dicatat dari transaksi persetujuan Dekan.">
          <Field label="Nomor SKPI" error={err("skpiId")} hint={`Format NNN/${fac.unitCode}/SKPI/YYYY`}>
            <Input
              value={form.skpiId}
              onChange={set("skpiId")}
              onBlur={blur("skpiId")}
              autoComplete="off"
              placeholder={`001/${fac.unitCode}/SKPI/2026`}
              className="font-mono tabular-nums"
            />
          </Field>
        </FormGroup>

        <FormGroup index="04" title="Capaian SKP" note="Predikat dihitung chaincode dari total SKP; minimal 25 SKP.">
          <Field label="Total SKP" error={err("totalSKP")} hint="Bilangan bulat, minimal 25">
            <Input
              value={form.totalSKP}
              onChange={set("totalSKP")}
              onBlur={blur("totalSKP")}
              inputMode="numeric"
              maxLength={4}
              placeholder="0"
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Predikat" hint={predicate ? `Otomatis · rentang ${predicateRange(predicate)} SKP` : "Otomatis dari total SKP"}>
            <Input value={predicate ?? ""} placeholder="—" readOnly tabIndex={-1} className="bg-canvas font-semibold text-ink" />
          </Field>
        </FormGroup>

        {serverError && (
          <p role="alert" className="border-t border-rose-200 bg-bad-soft px-6 py-3 text-sm text-rose-700">
            {serverError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4 border-t border-line bg-canvas px-6 py-4">
          <p className="flex flex-1 items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={15} className="text-ok" />
            Diajukan sebagai <span className="font-mono text-slate-700">{user.actorId}</span>
          </p>
          <Button
            variant="ghost"
            disabled={submitting}
            onClick={() => {
              setForm(emptyForm(faculty))
              setTouched({})
              setServerError(null)
            }}
          >
            Kosongkan
          </Button>
          <Button type="submit" variant="primary" loading={submitting} loadingLabel="Menyimpan draft…" className="min-w-48">
            Ajukan ke Dekan <ArrowRight size={16} />
          </Button>
        </div>
      </div>

      <aside className="col-span-12 lg:col-span-4">
        <div className="space-y-6 lg:sticky lg:top-24">
          <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgb(12_10_8/0.04)]">
            <SectionTitle title="Pratinjau aset" aside={<span className="font-mono text-[11px] text-slate-400">SahkanDekan</span>} />
            <dl className="divide-y divide-line px-5 py-2 font-mono text-xs">
              {preview.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[110px_1fr] gap-3 py-2">
                  <dt className="text-slate-400">{k}</dt>
                  <dd className={cx("break-all tabular-nums", v === "—" || v.startsWith("diisi") ? "text-slate-300" : "text-slate-800")}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="rounded-xl border border-line bg-canvas p-5">
            <p className="text-sm font-semibold text-ink">Setelah dikirim</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Draft disimpan di basis data aplikasi. Data baru masuk ledger setelah Dekan menyetujui, lalu aktif setelah Rektor
              mengesahkan.
            </p>
            <ol className="mt-4 space-y-2 text-xs text-slate-600">
              {["Admin · diajukan", "Dekan · menunggu", "Rektor · menunggu", "Ledger · aktif"].map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={cx("size-1.5 rounded-full", i === 0 ? "bg-brand" : i === 1 ? "bg-warn" : "bg-slate-300")} />
                  {s}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </aside>
    </form>
  )
}
