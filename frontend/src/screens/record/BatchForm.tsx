import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { ArrowRight, Check, Download, FileSpreadsheet, Plus, Trash2, Upload } from "lucide-react"
import { userMessage } from "@/api/errors"
import { useApi } from "@/app/ApiProvider"
import { notify } from "@/app/notify"
import { useUser } from "@/app/session"
import { Badge, Button, IconButton, Input, SectionTitle, Select, Textarea, cx, td, th } from "@/components/ui"
import { CSV_COLUMNS, csvTemplate, parseCsv } from "@/domain/csv"
import { facultyByCode } from "@/domain/faculty"
import { normalizeNpm, toInput, validateSkpi, type FormErrors, type SkpiForm } from "@/domain/skpi"
import type { Submitted } from "./Receipt"
import { draftPredicate, emptyForm } from "./SingleForm"

interface Row extends SkpiForm {
  id: string
  serverError?: string
}

let rowSeq = 0
const newRow = (f: SkpiForm): Row => ({ ...f, id: `r${++rowSeq}` })

function duplicates(values: string[]) {
  const seen = new Map<string, number>()
  values.forEach((v) => v && seen.set(v, (seen.get(v) ?? 0) + 1))
  return new Set([...seen].filter(([, n]) => n > 1).map(([v]) => v))
}

export function BatchForm({ onDone }: { onDone: (s: Submitted[]) => void }) {
  const user = useUser()
  const api = useApi()
  const faculty = user.faculty!
  const fac = facultyByCode(faculty)
  const [rows, setRows] = useState<Row[]>(() => [newRow(emptyForm(faculty))])
  const [paste, setPaste] = useState("")
  const [pasteOpen, setPasteOpen] = useState(false)
  const [notice, setNotice] = useState("Unggah CSV, tempel data dari spreadsheet, atau isi tabel langsung.")
  const [submitting, setSubmitting] = useState(false)
  const busy = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const checked = useMemo(() => {
    const npms = duplicates(rows.map((r) => normalizeNpm(r.npm)))
    const ids = duplicates(rows.map((r) => r.skpiId.trim()))
    return rows.map((row) => {
      const errors: FormErrors = validateSkpi(row, faculty)
      if (!errors.npm && npms.has(normalizeNpm(row.npm))) errors.npm = "NPM ganda dalam batch."
      if (!errors.skpiId && ids.has(row.skpiId.trim())) errors.skpiId = "Nomor SKPI ganda dalam batch."
      return { row, errors, first: Object.values(errors)[0] ?? row.serverError }
    })
  }, [rows, faculty])
  const ready = checked.filter((c) => !Object.keys(c.errors).length)

  const update = (id: string, k: keyof SkpiForm, v: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v, serverError: undefined } : r)))

  function load(text: string, source: string) {
    try {
      const parsed = parseCsv(text)
      if (!parsed.length) return setNotice(`Tidak ada baris yang dapat dibaca dari ${source}.`)
      setRows(parsed.map(newRow))
      setNotice(`${parsed.length} baris dimuat dari ${source}.`)
      setPasteOpen(false)
      setPaste("")
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Berkas tidak dapat dibaca.")
    }
  }

  function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => load(String(reader.result ?? ""), file.name)
    reader.readAsText(file)
    e.target.value = ""
  }

  function download() {
    const url = URL.createObjectURL(new Blob([csvTemplate(faculty)], { type: "text/csv;charset=utf-8" }))
    const a = Object.assign(document.createElement("a"), { href: url, download: `templat-skpi-${faculty.toLowerCase()}.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }

  async function submit() {
    if (busy.current || !ready.length) return
    busy.current = true
    setSubmitting(true)
    const items = ready.map((c) => toInput(c.row))
    try {
      const res = await api.createDrafts(items)
      const failed = new Map(res.errors.map((e) => [ready[e.index].row.id, e.message]))
      if (!failed.size) return onDone(items.map(({ npm, name, skpiId }) => ({ npm, name, skpiId })))
      const sent = new Set(ready.map((c) => c.row.id).filter((id) => !failed.has(id)))
      setRows((rs) => rs.filter((r) => !sent.has(r.id)).map((r) => (failed.has(r.id) ? { ...r, serverError: failed.get(r.id) } : r)))
      notify(`${sent.size} draft diajukan · ${failed.size} ditolak server`)
      setSubmitting(false)
    } catch (e) {
      setNotice(userMessage(e))
      setSubmitting(false)
    } finally {
      busy.current = false
    }
  }

  const cell = "h-9 text-[13px]"
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-12 items-center gap-6 rounded-xl border border-line bg-canvas px-6 py-5">
        <div className="col-span-12 flex items-start gap-4 lg:col-span-6">
          <FileSpreadsheet size={22} className="mt-0.5 shrink-0 text-brand" />
          <div>
            <p className="text-sm font-semibold text-ink">Impor daftar lulusan {faculty}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Kolom: <span className="font-mono">{CSV_COLUMNS.split(",").join(", ")}</span>. Pemisah koma, titik koma, atau tab;
              predikat dihitung otomatis.
            </p>
          </div>
        </div>
        <div className="col-span-12 flex flex-wrap gap-2 lg:col-span-6 lg:justify-end">
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={upload} />
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Unggah CSV
          </Button>
          <Button size="sm" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen}>
            Tempel data
          </Button>
          <Button size="sm" variant="ghost" onClick={download}>
            <Download size={15} /> Templat
          </Button>
        </div>
        {pasteOpen && (
          <div className="col-span-12">
            <Textarea
              aria-label="Data CSV"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={csvTemplate(faculty)}
              className="font-mono text-xs"
              rows={5}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPasteOpen(false)}>
                Batal
              </Button>
              <Button size="sm" variant="primary" onClick={() => load(paste, "teks tempelan")} disabled={!paste.trim()}>
                Muat ke tabel
              </Button>
            </div>
          </div>
        )}
        <p role="status" className="col-span-12 border-t border-line pt-4 text-xs text-slate-600">
          {notice}
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgb(12_10_8/0.04)]">
        <SectionTitle
          title={`Batch · ${rows.length} baris`}
          aside={
            <div className="flex items-center gap-2">
              <Badge tone="ok">{ready.length} siap</Badge>
              {rows.length - ready.length > 0 && <Badge tone="muted">{rows.length - ready.length} perlu koreksi</Badge>}
            </div>
          }
        />
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-canvas">
              <tr>
                <th className={cx(th, "w-10")}>#</th>
                <th className={th}>NPM</th>
                <th className={th}>Nama lulusan</th>
                <th className={th}>Nomor SKPI</th>
                <th className={th}>Program studi</th>
                <th className={th}>Total SKP</th>
                <th className={th}>Validasi</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {checked.map(({ row, errors, first }, i) => (
                <tr key={row.id} className="border-t border-line align-top">
                  <td className={cx(td, "pt-5 font-mono text-xs text-slate-400")}>{i + 1}</td>
                  <td className="px-2 py-3">
                    <Input
                      aria-label={`NPM baris ${i + 1}`}
                      value={row.npm}
                      onChange={(e) => update(row.id, "npm", e.target.value)}
                      invalid={!!errors.npm}
                      inputMode="numeric"
                      className={cx(cell, "w-32 font-mono tabular-nums")}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <Input
                      aria-label={`Nama baris ${i + 1}`}
                      value={row.name}
                      onChange={(e) => update(row.id, "name", e.target.value)}
                      invalid={!!errors.name}
                      className={cx(cell, "min-w-44")}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <Input
                      aria-label={`Nomor SKPI baris ${i + 1}`}
                      value={row.skpiId}
                      onChange={(e) => update(row.id, "skpiId", e.target.value)}
                      invalid={!!errors.skpiId}
                      className={cx(cell, "w-48 font-mono tabular-nums")}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <Select
                      aria-label={`Program studi baris ${i + 1}`}
                      value={row.programStudy}
                      onChange={(e) => update(row.id, "programStudy", e.target.value)}
                      invalid={!!errors.programStudy}
                      className={cx(cell, "w-52")}
                    >
                      {!fac.programs.includes(row.programStudy) && <option value={row.programStudy}>{row.programStudy || "—"}</option>}
                      {fac.programs.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-3">
                    <Input
                      aria-label={`Total SKP baris ${i + 1}`}
                      value={row.totalSKP}
                      onChange={(e) => update(row.id, "totalSKP", e.target.value)}
                      inputMode="numeric"
                      invalid={!!errors.totalSKP}
                      className={cx(cell, "w-20 font-mono tabular-nums")}
                    />
                    <span className="mt-1 block text-[11px] text-slate-500">{draftPredicate(row.totalSKP) ?? "—"}</span>
                  </td>
                  <td className={cx(td, "pt-4")}>
                    {first ? (
                      <span className="block max-w-56 text-xs leading-snug text-bad">{first}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok">
                        <Check size={14} /> Siap
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <IconButton
                      label={`Hapus baris ${i + 1}`}
                      onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
                      disabled={rows.length <= 1}
                      className="hover:text-bad"
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-line bg-canvas px-6 py-4">
          <Button size="sm" variant="ghost" onClick={() => setRows((rs) => [...rs, newRow(emptyForm(faculty))])}>
            <Plus size={15} /> Tambah baris
          </Button>
          <p className="flex-1 text-xs text-slate-500">
            Setiap baris valid menjadi satu draft pencatatan. Baris yang belum valid tidak ikut dikirim.
          </p>
          <Button variant="primary" onClick={submit} disabled={!ready.length} loading={submitting} loadingLabel="Menyimpan draft…" className="min-w-52">
            Ajukan {ready.length} SKPI <ArrowRight size={16} />
          </Button>
        </div>
      </section>
    </div>
  )
}
