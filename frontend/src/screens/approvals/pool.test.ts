import { mapPool } from "./pool"

const tick = () => new Promise<void>((r) => setTimeout(r, 0))
const values = <R,>(rs: Awaited<ReturnType<typeof mapPool<number, R>>>) => rs.map((r) => (r.ok ? r.value : null))

test("tidak melebihi batas konkurensi dan semua item diproses", async () => {
  let running = 0
  let peak = 0
  const out = await mapPool(Array.from({ length: 30 }, (_, i) => i), 12, async (n) => {
    running++
    peak = Math.max(peak, running)
    await tick()
    running--
    return n * 2
  })
  expect(peak).toBe(12)
  expect(values(out)).toEqual(Array.from({ length: 30 }, (_, i) => i * 2))
})

test("hasil mengikuti urutan input walau selesai tidak berurutan", async () => {
  const out = await mapPool([30, 1, 15, 1], 4, async (ms, i) => {
    await new Promise((r) => setTimeout(r, ms))
    return i
  })
  expect(values(out)).toEqual([0, 1, 2, 3])
})

test("galat satu item tidak menghentikan yang lain: hasil dilaporkan per item", async () => {
  const out = await mapPool([1, 2, 3, 4], 2, async (n) => {
    if (n === 2) throw new Error("gagal 2")
    return n
  })
  expect(values(out)).toEqual([1, null, 3, 4])
  const failed = out[1]
  expect(failed.ok).toBe(false)
  if (!failed.ok) expect((failed.error as Error).message).toBe("gagal 2")
})

test("onDone dipanggil sekali per item dengan jumlah selesai yang naik", async () => {
  const seen: number[] = []
  await mapPool([1, 2, 3, 4, 5], 2, async (n) => n, (done) => seen.push(done))
  expect(seen).toEqual([1, 2, 3, 4, 5])
})

test("daftar kosong dan batas lebih besar dari jumlah item", async () => {
  expect(await mapPool([], 12, async (n: number) => n)).toEqual([])
  expect(values(await mapPool([1, 2], 12, async (n) => n))).toEqual([1, 2])
})
