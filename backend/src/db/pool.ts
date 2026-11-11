import pg from "pg"

/** Pool atau client transaksi: repositori menerima keduanya. */
export type Queryable = Pick<pg.Pool, "query">

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 })
}

/** Jalankan `fn` dalam satu transaksi; rollback bila melempar. */
export async function withTx<T>(pool: pg.Pool, fn: (q: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const out = await fn(client)
    await client.query("COMMIT")
    return out
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw e
  } finally {
    client.release()
  }
}
