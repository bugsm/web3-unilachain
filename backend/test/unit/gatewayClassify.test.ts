import { expect } from "chai"
import sinon from "sinon"
import * as grpc from "@grpc/grpc-js"
import { GatewayError } from "@hyperledger/fabric-gateway"
import { classifyGatewayError } from "../../src/fabric/gateway.js"
import { toApiError } from "../../src/fabric/errors.js"
import { LedgerError } from "../../src/fabric/ledger.js"
import { logger } from "../../src/log.js"

const gwErr = (code: number, message: string, detail?: string) =>
  new GatewayError({
    code,
    message,
    details: detail ? [{ address: "peer1.unila.local:7051", mspId: "UnilaMSP", message: detail }] : [],
    cause: { code, details: message, metadata: new grpc.Metadata(), message, name: "Error" } as grpc.ServiceError,
  })

describe("klasifikasi galat gateway nyata", () => {
  it("penolakan chaincode → REJECTED dengan pesan chaincode", () => {
    const e = classifyGatewayError(gwErr(grpc.status.ABORTED, "10 ABORTED: failed to endorse transaction", "chaincode response 500, Akses ditolak: NPM 2017051008 bukan mahasiswa fakultas FT"), "endorse")
    expect(e.kind).to.equal("REJECTED")
    expect(e.message).to.equal("Akses ditolak: NPM 2017051008 bukan mahasiswa fakultas FT")
  })

  it("endorser lain tak terjangkau (policy AND kedua peer) → UNAVAILABLE, bukan 400 dengan IP internal", () => {
    const e = classifyGatewayError(
      gwErr(grpc.status.ABORTED, "10 ABORTED: failed to collect enough transaction endorsements", "rpc error: code = Unavailable desc = connection error: dial tcp 192.168.56.12:7051: connect: connection refused"),
      "endorse",
    )
    expect(e.kind).to.equal("UNAVAILABLE")
    const api = toApiError(e)
    expect(api.status).to.equal(503)
    expect(api.message).to.not.include("192.168")
  })

  it("galat gateway lain tanpa pesan chaincode → 502 generik tanpa rincian", () => {
    const e = classifyGatewayError(gwErr(grpc.status.INTERNAL, "13 INTERNAL: something broke at /var/hyperledger/x", "panic in peer"), "endorse")
    expect(e.kind).to.equal("ERROR")
    expect(toApiError(e)).to.deep.include({ status: 502, code: "LEDGER_ERROR", message: "Ledger mengembalikan galat." })
  })

  it("rincian galat ledger dicatat ke log server", () => {
    const warn = sinon.spy(logger, "warn")
    try {
      toApiError(new LedgerError("UNAVAILABLE", "14 UNAVAILABLE: No connection established", "tx123"))
      expect(warn.calledOnce).to.equal(true)
      expect(warn.firstCall.args[0]).to.deep.include({ kind: "UNAVAILABLE", txId: "tx123" })
    } finally {
      warn.restore()
    }
  })
})
