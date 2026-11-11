import { useRef, useState } from "react"
import { userMessage } from "@/api/errors"
import type { Official, OfficialPeriod } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { Button, Field, Input, Modal } from "@/components/ui"
import { OFFICE_LABEL, normalizeOfficialName, validateOfficialName, wibDate } from "@/domain/officials"
import { formatDate } from "@/domain/format"

export type OfficialAction = { kind: "koreksi"; official: Official; period: OfficialPeriod } | { kind: "pergantian"; official: Official }

export function OfficialModal({ action, onClose, onSaved }: { action: OfficialAction; onClose: () => void; onSaved: (m: string) => void }) {
  const api = useApi()
  const label = OFFICE_LABEL(action.official.office)
  const current = action.official.periods[action.official.periods.length - 1]
  const [name, setName] = useState(action.kind === "koreksi" ? action.period.name : "")
  const [from, setFrom] = useState("")
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const nameError = touched ? validateOfficialName(name) : undefined
  const today = wibDate(new Date().toISOString())
  const unchanged = action.kind === "koreksi" && normalizeOfficialName(name) === action.period.name

  async function save() {
    setTouched(true)
    if (lock.current || unchanged || validateOfficialName(name) || (action.kind === "pergantian" && !from)) return
    lock.current = true
    setSaving(true)
    setError(null)
    try {
      const clean = normalizeOfficialName(name)
      if (action.kind === "koreksi") await api.correctOfficial(action.official.office, action.period.id, clean)
      else await api.replaceOfficial(action.official.office, clean, from)
      onSaved(action.kind === "koreksi" ? `Nama ${label} dikoreksi` : `Pergantian ${label} dicatat`)
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
      title={action.kind === "koreksi" ? `Koreksi nama ${label}` : `Catat pergantian ${label}`}
      description={
        action.kind === "koreksi"
          ? `Memperbaiki salah ketik atau gelar pada periode sejak ${formatDate(action.period.from)}. Tanggal periode tidak berubah; SKPI pada periode ini ikut menampilkan nama terkoreksi.`
          : `Periode ${current.name} ditutup sehari sebelum tanggal mulai baru. SKPI yang disahkan sebelumnya tetap menampilkan pejabat lama.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button variant="primary" loading={saving} disabled={unchanged} onClick={save}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Nama & gelar lengkap" error={nameError} hint="3–150 karakter, sesuai SK pengangkatan.">
          <Input value={name} maxLength={150} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} />
        </Field>
        {action.kind === "pergantian" && (
          <Field
            label="Tanggal mulai menjabat"
            error={touched && !from ? "Tanggal mulai wajib diisi." : undefined}
            hint={`Setelah ${formatDate(current.from)}, paling lambat hari ini.`}
          >
            <Input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="font-mono tabular-nums" />
          </Field>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-[#FFF1F2] px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
