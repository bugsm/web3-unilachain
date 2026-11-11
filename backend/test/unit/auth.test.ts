import { expect } from "chai"
import request from "supertest"
import { users } from "../../src/db/repos/users.js"
import { DEMO_PASSWORD, buildTestApp, testConfig } from "../helpers/app.js"

describe("akun dan sesi", () => {
  it("login sukses mengembalikan {user} dan cookie sesi httpOnly", async () => {
    const { app } = await buildTestApp()
    const res = await request(app).post("/api/auth/login").send({ identifier: "dekan.fmipa@unila.ac.id", password: DEMO_PASSWORD })
    expect(res.status).to.equal(200)
    expect(res.body.user).to.deep.include({ name: "Dekan FMIPA", role: "dekan", faculty: "FMIPA", actorId: "dekan-fmipa@UnilaMSP" })
    expect(res.body.user).to.not.have.property("passwordHash")
    const cookie = String(res.headers["set-cookie"])
    expect(cookie).to.match(/skpi_session=/)
    expect(cookie).to.match(/HttpOnly/i)
    expect(cookie).to.match(/SameSite=Lax/i)
  })

  it("cookie Secure bila COOKIE_SECURE=true", async () => {
    const { app } = await buildTestApp({ config: { ...testConfig, cookieSecure: true } })
    const res = await request(app).post("/api/auth/login").send({ identifier: "rektor@unila.ac.id", password: DEMO_PASSWORD })
    expect(String(res.headers["set-cookie"])).to.match(/Secure/)
  })

  it("me dan logout", async () => {
    const { app, agentAs } = await buildTestApp()
    const agent = await agentAs("admin.fmipa@unila.ac.id")
    const me = await agent.get("/api/auth/me")
    expect(me.status).to.equal(200)
    expect(me.body.user).to.deep.include({ role: "admin", faculty: "FMIPA", actorId: "admin.fmipa (off-chain)" })
    expect((await agent.post("/api/auth/logout")).status).to.equal(204)
    expect((await agent.get("/api/auth/me")).status).to.equal(401)
    expect((await request(app).get("/api/auth/me")).status).to.equal(401)
  })

  it("peran dari akun, bukan dari body", async () => {
    const { app } = await buildTestApp()
    const res = await request(app).post("/api/auth/login").send({ identifier: "dekan.fmipa@unila.ac.id", password: DEMO_PASSWORD, role: "rektor" })
    expect(res.body.user.role).to.equal("dekan")
  })

  it("login dengan NIP, NIDN, dan email ber-spasi/huruf besar", async () => {
    const { app } = await buildTestApp()
    for (const identifier of ["198001012005011001", "0012345678", "  Rektor@UNILA.ac.id "]) {
      const res = await request(app).post("/api/auth/login").send({ identifier, password: DEMO_PASSWORD })
      expect(res.status, identifier).to.equal(200)
    }
  })

  it("sandi salah, akun tidak ada, dan akun nonaktif memberi pesan seragam", async () => {
    const { app, pool } = await buildTestApp()
    await pool.query("UPDATE users SET active = false WHERE email = 'admin.ft@unila.ac.id'")
    for (const [identifier, password] of [
      ["admin.fmipa@unila.ac.id", "salah-sekali"],
      ["tidak.ada@unila.ac.id", DEMO_PASSWORD],
      ["admin.ft@unila.ac.id", DEMO_PASSWORD],
    ]) {
      const res = await request(app).post("/api/auth/login").send({ identifier, password })
      expect(res.status, identifier).to.equal(401)
      expect(res.body).to.deep.equal({ error: { code: "INVALID_CREDENTIALS", message: "Email atau kata sandi salah." } })
    }
  })

  it("sesi akun yang dinonaktifkan langsung tidak berlaku", async () => {
    const { pool, agentAs } = await buildTestApp()
    const agent = await agentAs("admin.fmipa@unila.ac.id")
    await pool.query("UPDATE users SET active = false WHERE email = 'admin.fmipa@unila.ac.id'")
    expect((await agent.get("/api/auth/me")).status).to.equal(401)
  })

  it("body kosong atau rusak → 400, bukan 500", async () => {
    const { app } = await buildTestApp()
    expect((await request(app).post("/api/auth/login").send({})).status).to.equal(400)
    const bad = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{rusak")
    expect(bad.status).to.equal(400)
    expect(bad.body.error.code).to.equal("VALIDATION")
  })

  it("login gagal berulang dibatasi (429)", async () => {
    const { app } = await buildTestApp({ config: { ...testConfig, loginRateLimitPerMin: 3 } })
    for (let i = 0; i < 3; i++) await request(app).post("/api/auth/login").send({ identifier: "x@unila.ac.id", password: "salah-salah" })
    const res = await request(app).post("/api/auth/login").send({ identifier: "x@unila.ac.id", password: "salah-salah" })
    expect(res.status).to.equal(429)
    expect(res.body.error.code).to.equal("RATE_LIMITED")
  })

  it("rute tidak dikenal → 404 JSON", async () => {
    const { app } = await buildTestApp()
    const res = await request(app).get("/api/tidak-ada")
    expect(res.status).to.equal(404)
    expect(res.body.error.code).to.equal("NOT_FOUND")
  })

  it("hash sandi tidak pernah keluar dari repositori ke respons", async () => {
    const { pool } = await buildTestApp()
    expect((await users.findByIdentifier(pool, "rektor@unila.ac.id"))?.passwordHash).to.match(/^\$argon2id\$/)
  })
})
