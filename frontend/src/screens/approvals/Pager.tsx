import { Button } from "@/components/ui"
import { PAGE_SIZES, type PageSize } from "./paging"

const LABEL: Record<PageSize, string> = { "10": "10", "50": "50", "100": "100", all: "Semua" }

/** Pemilih jumlah baris per halaman (10, 50, 100, atau semua). */
export function PageSizeSelect({ value, onChange }: { value: PageSize; onChange: (size: PageSize) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-500">
      Tampilkan
      <select
        aria-label="Baris per halaman"
        value={value}
        onChange={(e) => onChange(e.target.value as PageSize)}
        className="h-8 rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-brand focus:ring-4 focus:ring-brand/10"
      >
        {PAGE_SIZES.map((s) => (
          <option key={s} value={s}>
            {LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Keterangan rentang yang tampil dan tombol halaman (tombol hanya bila lebih dari satu halaman). */
export function PagerBar({
  from,
  to,
  total,
  page,
  pages,
  onPage,
}: {
  from: number
  to: number
  total: number
  page: number
  pages: number
  onPage: (page: number) => void
}) {
  if (total === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-slate-500">
      <p className="tabular-nums">
        Menampilkan {from}–{to} dari {total}
      </p>
      {pages > 1 && (
        <nav aria-label="Halaman antrean" className="flex items-center gap-3">
          <Button size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
            Sebelumnya
          </Button>
          <span className="tabular-nums">
            Halaman {page} dari {pages}
          </span>
          <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>
            Berikutnya
          </Button>
        </nav>
      )}
    </div>
  )
}
