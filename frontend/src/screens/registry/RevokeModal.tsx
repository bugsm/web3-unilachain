import { useRef, useState } from "react"
import { Ban } from "lucide-react"
import { userMessage } from "@/api/errors"
import type { SkpiRecord } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { Button, Field, Input, Modal, Textarea } from "@/components/ui"
import { validateReason } from "@/domain/skpi"

export function RevokeModal({ record, onClose, onSaved }: { record: SkpiRecord; onClose: () => void; onSaved: (m: string) => void }) {
  const api = useApi()
  const [reason, setReason] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const valid = !validateReason(reason) && confirm.trim() === record.npm

  async function save() {
    if (lock.current || !valid) return
    lock.current = true
    setSaving(true)
    setError(null)
    try {
      await api.createDraft({ type: "PENCABUTAN", npm: record.npm, reason: reason.trim() })
      onSaved("Draft pencabutan diajukan ke Dekan")
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
      title={`Ajukan pencabutan SKPI ${record.name}?`}
      description="Pencabutan berlaku setelah Dekan menyetujui (CabutSKPI). Setelah itu verifikator melihat status Dicabut secara permanen."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button variant="dangerSolid" disabled={!valid} loading={saving} onClick={save}>
            <Ban size={15} /> Ajukan pencabutan
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Alasan pencabutan" hint="Minimal 10 karakter. Alasan tidak ditampilkan di portal publik.">
          <Textarea
            autoFocus
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: Dokumen diterbitkan ulang dengan nomor baru."
          />
        </Field>
        <Field label={`Ketik NPM ${record.npm} untuk konfirmasi`}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} inputMode="numeric" autoComplete="off" className="font-mono tabular-nums" />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-[#FFF1F2] px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
