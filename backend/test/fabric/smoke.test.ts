/*
 * Uji asap ke jaringan riset NYATA (bukan unit test). Dijalankan eksplisit oleh pengguna dengan VM menyala:
 *   FABRIC_PEER_ENDPOINT=... FABRIC_PEER_HOST_ALIAS=... FABRIC_TLS_CA_PATH=../wallet/tls-ca.pem \
 *   FABRIC_WALLET_DIR=../wallet DATABASE_URL=x JWT_SECRET=<32+> npm run test:fabric
 * Hanya membaca (tanpa transaksi tulis).
 */
import { expect } from "chai"
import { loadConfig } from "../../src/config.js"
import { createFabricLedger } from "../../src/fabric/gateway.js"
import type { Ledger } from "../../src/fabric/ledger.js"

describe("jaringan Fabric riset (asap, hanya baca)", function () {
  let ledger: Ledger

  before(async function () {
    if (!process.env.FABRIC_PEER_ENDPOINT) this.skip()
    ledger = await createFabricLedger(loadConfig(process.env).fabric)
  })

  after(async () => {
    await ledger?.close()
  })

  it("qscc GetChainInfo memberi tinggi chain > 0", async () => {
    expect(await ledger.chainHeight()).to.be.greaterThan(0)
  })

  it("VerifikasiSKPI dengan app-reader menjawab salah satu status yang sah", async () => {
    const r = JSON.parse(await ledger.evaluate("app-reader", "VerifikasiSKPI", ["9917059999"]))
    expect(["TERDAFTAR", "DICABUT", "BELUM_SAH", "TIDAK_TERDAFTAR"]).to.include(r.status)
  })

  it("txId yang tidak ada → UNKNOWN", async () => {
    expect(await ledger.txStatus("0".repeat(64))).to.equal("UNKNOWN")
  })
})
