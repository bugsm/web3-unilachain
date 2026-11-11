import { expect } from "chai"
import { actorFromId, toApiError } from "../../src/fabric/errors.js"
import type { GatewayError } from "@hyperledger/fabric-gateway"
import { chaincodeMessage } from "../../src/fabric/gateway.js"
import { LedgerError } from "../../src/fabric/ledger.js"

const map = (e: unknown) => {
  const a = toApiError(e)
  return [a.status, a.code, a.message] as const
}

describe("pemetaan galat ledger → HTTP", () => {
  it("penolakan chaincode dipetakan menurut isi pesan", () => {
    expect(map(new LedgerError("REJECTED", "Akses ditolak: NPM 2017051008 bukan mahasiswa fakultas FT"))[0]).to.equal(403)
    expect(map(new LedgerError("REJECTED", "SKPI dengan NPM 2017059999 tidak ditemukan"))).to.deep.equal([404, "NOT_FOUND", "SKPI dengan NPM 2017059999 tidak ditemukan."])
    expect(map(new LedgerError("REJECTED", "SKPI 2017051008 berstatus AKTIF, seharusnya MENUNGGU_REKTOR"))[0]).to.equal(409)
    expect(map(new LedgerError("REJECTED", "Nomor SKPI 001/UN26.17/SKPI/2026 sudah dipakai"))[0]).to.equal(409)
    expect(map(new LedgerError("REJECTED", "NPM 2017051008 sudah memiliki SKPI berstatus AKTIF"))[0]).to.equal(409)
    expect(map(new LedgerError("REJECTED", "MVCC_READ_CONFLICT"))).to.deep.equal([409, "CONFLICT", "Data berubah bersamaan dengan transaksi lain, coba lagi."])
    expect(map(new LedgerError("REJECTED", "totalSKP 10 tidak memenuhi syarat SKPI (minimal 25)"))).to.deep.equal([400, "VALIDATION", "totalSKP 10 tidak memenuhi syarat SKPI (minimal 25)."])
  })

  it("peer tak terjangkau dan status commit tidak pasti → 503", () => {
    expect(map(new LedgerError("UNAVAILABLE", "14 UNAVAILABLE: No connection established"))).to.deep.equal([503, "UNAVAILABLE", "Layanan ledger sedang tidak terjangkau."])
    expect(map(new LedgerError("COMMIT_UNKNOWN", "deadline", "abc"))).to.deep.equal([503, "COMMIT_UNKNOWN", "Status transaksi belum pasti; sistem akan memeriksanya kembali."])
  })

  it("galat lain tidak membocorkan isi", () => {
    expect(map(new Error("ENOENT: /wallet/dekan-fmipa/key.pem"))).to.deep.equal([502, "LEDGER_ERROR", "Ledger mengembalikan galat."])
  })

  it("nama penanda tangan dari ID X.509", () => {
    expect(actorFromId("x509::/OU=client/CN=dekan-fmipa::/C=ID/CN=ca.unila.local", "UnilaMSP")).to.equal("dekan-fmipa@UnilaMSP")
    expect(actorFromId("", "UnilaMSP")).to.equal("")
  })

  it("pesan chaincode diambil dari detail galat gateway", () => {
    const e = {
      message: "10 ABORTED: failed to endorse transaction, see attached details for more info",
      details: [{ address: "peer1.unila.local:7051", mspId: "UnilaMSP", message: "chaincode response 500, SKPI dengan NPM 2017059999 tidak ditemukan" }],
    } as unknown as GatewayError
    expect(chaincodeMessage(e)).to.equal("SKPI dengan NPM 2017059999 tidak ditemukan")
    const evalErr = { message: "2 UNKNOWN: evaluate call to endorser returned error: chaincode response 500, Akses ditolak: peran reader dari UnilaMSP tidak diizinkan", details: [] } as unknown as GatewayError
    expect(chaincodeMessage(evalErr)).to.equal("Akses ditolak: peran reader dari UnilaMSP tidak diizinkan")
  })
})
