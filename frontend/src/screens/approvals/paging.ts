import { useState } from "react"

/** Pilihan jumlah baris per halaman di antrean; "all" menampilkan semuanya. */
export const PAGE_SIZES = ["10", "50", "100", "all"] as const
export type PageSize = (typeof PAGE_SIZES)[number]
export const PAGE_SIZE_KEY = "skpi.antrean.perHalaman"
const DEFAULT_SIZE: PageSize = "10"

/** Pilihan terakhir pengguna di peramban ini; nilai yang tidak sah atau penyimpanan yang diblokir kembali ke bawaan. */
function readSize(): PageSize {
  try {
    const v = localStorage.getItem(PAGE_SIZE_KEY)
    return PAGE_SIZES.find((s) => s === v) ?? DEFAULT_SIZE
  } catch {
    return DEFAULT_SIZE
  }
}

function writeSize(size: PageSize) {
  try {
    localStorage.setItem(PAGE_SIZE_KEY, size)
  } catch {
    /* penyimpanan diblokir: pilihan hanya berlaku selama halaman terbuka */
  }
}

/** Paginasi sisi klien. Halaman dijepit ke rentang yang sah, sehingga tetap benar saat jumlah baris berkurang (mis. setelah pengesahan). */
export function usePaging<T>(rows: readonly T[]) {
  const [size, setSizeState] = useState<PageSize>(readSize)
  const [requested, setPage] = useState(1)

  const total = rows.length
  const perPage = size === "all" ? Math.max(total, 1) : Number(size)
  const pages = Math.max(1, Math.ceil(total / perPage))
  const page = Math.min(Math.max(requested, 1), pages)
  const start = (page - 1) * perPage
  const visible = rows.slice(start, start + perPage)

  return {
    size,
    setSize(next: PageSize) {
      writeSize(next)
      setSizeState(next)
      setPage(1)
    },
    page,
    pages,
    setPage,
    visible,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + visible.length,
  }
}
