import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { userMessage } from "@/api/errors"
import type { Draft, SkpiRecord } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { useUser } from "@/app/session"
import { Button, Field, Input, Modal, Select } from "@/components/ui"
import { facultyByCode } from "@/domain/faculty"
import { predicateOf, predicateRange, toForm, toInput, validateSkpi, type SkpiForm } from "@/domain/skpi"

/** "perubahan": draft PERUBAHAN baru dari data aset. "perbaiki": ubah draft yang ditolak Dekan lalu ajukan ulang. */
export function DraftFormModal({
  mode,
  record,
  draft,
  onClose,
  onSaved,
}: {
  mode: "perubahan" | "perbaiki"
  record: SkpiRecord
  draft: Draft | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const api = useApi()
  const user = useUser()
  const fac = facultyByCode(user.faculty!)
  const source = mode === "perbaiki" && draft?.data ? { npm: record.npm, ...draft.data } : record
  const [form, setForm] = useState<SkpiForm>(() => toForm(source))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const errors = useMemo(() => validateSkpi(form, user.faculty!), [form, user.faculty])
  const next = toInput(form)
  const changed = (["name", "skpiId", "programStudy", "totalSKP"] as const).some((k) => String(next[k]) !== String(source[k]))
  const valid = !Object.keys(errors).length && (mode === "perbaiki" || changed)
  const total = form.totalSKP.trim()
  const predicate = /^\d+$/.test(total) ? predicateOf(Number(total)) : null
  const set = (k: keyof SkpiForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (lock.current || !valid) return
    lock.current = true
    setSaving(true)
    setError(null)
    const { npm, ...data } = next
    try {
      if (mode === "perbaiki" && draft) await api.updateDraft(draft.id, data)
      else await api.createDraft({ type: "PERUBAHAN", npm, data })
      onSaved(mode === "perbaiki" ? "Draft diperbaiki dan diajukan ulang ke Dekan" : "Draft perubahan diajukan ke Dekan")
    } catch (e) {
      setError(userMessage(e))
      setSaving(false)
    } finally {
      lock.current = false
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-xl"
      title={mode === "perbaiki" ? "Perbaiki & ajukan ulang" : "Ajukan perubahan"}
      description={
        mode === "perbaiki"
          ? "Draft diajukan ulang ke Dekan. Riwayat penolakan tetap tersimpan."
          : "Perubahan berlaku setelah Dekan menyetujui (PerbaruiSKPI). Waktu terbit tidak berubah; versi lama tetap ada di riwayat ledger."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button variant="primary" disabled={!valid} loading={saving} loadingLabel="Menyimpan draft…" onClick={save}>
            Ajukan ke Dekan
          </Button>
        </>
      }
    >
      {mode === "perbaiki" && draft?.rejectReason && (
        <div className="mb-6 border-l-2 border-slate-300 py-1 pl-4 text-sm">
          <p className="font-semibold text-ink">Alasan penolakan Dekan</p>
          <p className="mt-1 text-slate-600">{draft.rejectReason}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-5">
        <Field label="NPM" hint="Kunci aset, tidak dapat diubah" className="col-span-2 sm:col-span-1">
          <Input value={form.npm} readOnly className="font-mono tabular-nums" />
        </Field>
        <Field label="Nama lulusan" error={errors.name} className="col-span-2 sm:col-span-1">
          <Input value={form.name} onChange={set("name")} maxLength={100} />
        </Field>
        <Field label="Nomor SKPI" error={errors.skpiId} className="col-span-2 sm:col-span-1">
          <Input value={form.skpiId} onChange={set("skpiId")} className="font-mono tabular-nums" />
        </Field>
        <Field label="Program studi" error={errors.programStudy} className="col-span-2 sm:col-span-1">
          <Select value={form.programStudy} onChange={set("programStudy")}>
            {fac.programs.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Total SKP" error={errors.totalSKP} className="col-span-2 sm:col-span-1">
          <Input value={form.totalSKP} onChange={set("totalSKP")} inputMode="numeric" maxLength={4} className="font-mono tabular-nums" />
        </Field>
        <Field
          label="Predikat"
          hint={predicate ? `Otomatis · rentang ${predicateRange(predicate)} SKP` : "Otomatis dari total SKP"}
          className="col-span-2 sm:col-span-1"
        >
          <Input value={predicate ?? ""} placeholder="—" readOnly tabIndex={-1} className="bg-canvas font-semibold" />
        </Field>
      </div>
      {mode === "perubahan" && !changed && <p className="mt-5 text-xs text-slate-500">Ubah setidaknya satu atribut.</p>}
      {error && (
        <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-bad-soft px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}
    </Modal>
  )
}
