export type Settled<R> = { ok: true; value: R } | { ok: false; error: unknown }

/**
 * Menjalankan `fn` untuk setiap item dengan paling banyak `limit` pekerjaan berjalan bersamaan.
 * Hasil mengikuti urutan input; galat satu item dicatat per item dan tidak menghentikan item lain.
 * `onDone(jumlahSelesai)` dipanggil setiap satu item selesai (untuk indikator progres).
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onDone?: (done: number) => void,
): Promise<Settled<R>[]> {
  const out = new Array<Settled<R>>(items.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try {
        out[i] = { ok: true, value: await fn(items[i], i) }
      } catch (error) {
        out[i] = { ok: false, error }
      }
      onDone?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker))
  return out
}
