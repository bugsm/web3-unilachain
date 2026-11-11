import { expect } from "chai"
import { loadConfig } from "../../src/config.js"

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/skpi",
  JWT_SECRET: "x".repeat(32),
  FABRIC_PEER_ENDPOINT: "peer1.unila.local:7051",
  FABRIC_PEER_HOST_ALIAS: "peer1.unila.local",
  FABRIC_TLS_CA_PATH: "/wallet/tls-ca.pem",
  FABRIC_WALLET_DIR: "/wallet",
}

describe("config", () => {
  it("memuat nilai dan default", () => {
    const c = loadConfig(base)
    expect(c.port).to.equal(3000)
    expect(c.fabric.channel).to.equal("skpi-channel")
    expect(c.fabric.chaincode).to.equal("skpi")
    expect(c.fabric.mspId).to.equal("UnilaMSP")
    expect(c.fabric.readerIdentity).to.equal("app-reader")
    expect(c.cookieSecure).to.equal(true)
  })

  it("gagal dengan menyebut variabel yang hilang", () => {
    const { JWT_SECRET: _omit, ...rest } = base
    expect(() => loadConfig(rest)).to.throw(/JWT_SECRET/)
  })

  it("rahasia JWT minimal 32 karakter", () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: "pendek" })).to.throw(/JWT_SECRET/)
  })
})
