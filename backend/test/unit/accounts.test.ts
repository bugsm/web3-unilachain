import { expect } from "chai"
import { verify } from "@node-rs/argon2"
import { users } from "../../src/db/repos/users.js"
import { createAccount, type NewAccount } from "../../src/services/accounts.js"
import { resetDb } from "../helpers/db.js"

const base: NewAccount = { email: "Dekan.FEB@unila.ac.id", name: "Dekan FEB", role: "dekan", faculty: "FEB", identity: "dekan-feb", nip: null, nidn: null, password: "sandi-panjang-sekali" }

describe("pembuatan akun (CLI)", () => {
  it("membuat akun dekan dengan identitas fakultasnya dan sandi ter-hash", async () => {
    const db = await resetDb()
    const u = await createAccount(db, base)
    expect(u).to.deep.include({ email: "dekan.feb@unila.ac.id", role: "dekan", faculty: "FEB", fabricIdentity: "dekan-feb" })
    const row = await users.findByIdentifier(db, "dekan.feb@unila.ac.id")
    expect(await verify(row!.passwordHash, "sandi-panjang-sekali")).to.equal(true)
  })

  it("menolak kombinasi peran, fakultas, dan identitas yang tidak cocok", async () => {
    const db = await resetDb()
    const bad: Array<[Partial<NewAccount>, RegExp]> = [
      [{ identity: "dekan-ft" }, /dekan-feb/],
      [{ role: "rektor", faculty: "FEB" }, /Rektor/],
      [{ role: "admin", identity: "dekan-feb" }, /Admin/],
      [{ faculty: null }, /fakultas/],
      [{ password: "pendek" }, /12 karakter/],
      [{ nip: "123" }, /NIP/],
      [{ email: "bukan-email" }, /email/i],
    ]
    for (const [over, msg] of bad) {
      let err: unknown
      try {
        await createAccount(db, { ...base, ...over })
      } catch (e) {
        err = e
      }
      expect(err, JSON.stringify(over)).to.be.instanceOf(Error)
      expect((err as Error).message, JSON.stringify(over)).to.match(msg)
    }
  })

  it("akun rektor tanpa fakultas dengan identitas rektor", async () => {
    const db = await resetDb()
    const u = await createAccount(db, { ...base, email: "rektor@unila.ac.id", role: "rektor", faculty: null, identity: "rektor" })
    expect(u).to.deep.include({ role: "rektor", faculty: null, fabricIdentity: "rektor" })
  })
})
