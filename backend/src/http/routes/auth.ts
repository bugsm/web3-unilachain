import { Router } from "express"
import { z } from "zod"
import type { AppDeps } from "../../app.js"
import { authenticate, toUser } from "../../services/auth.js"
import { badRequest } from "../errors.js"
import { perMinute } from "../rateLimit.js"
import { clearSession, issueSession, requireUser } from "../session.js"

// `role` dari klien diabaikan: satu portal, peran dari akun.
const LoginBody = z.object({ identifier: z.string().min(1).max(200), password: z.string().min(1).max(200) })

export function authRoutes({ config, pool }: AppDeps) {
  const r = Router()

  r.post("/login", perMinute(config.loginRateLimitPerMin), async (req, res) => {
    const body = LoginBody.safeParse(req.body)
    if (!body.success) throw badRequest("Email/NIP/NIDN dan kata sandi wajib diisi.")
    const row = await authenticate(pool, body.data.identifier, body.data.password)
    issueSession(res, config, row.id)
    res.json({ user: toUser(row, config.fabric.mspId) })
  })

  r.get("/me", requireUser(config, pool), (req, res) => {
    res.json({ user: toUser(req.account!, config.fabric.mspId) })
  })

  r.post("/logout", (_req, res) => {
    clearSession(res, config)
    res.status(204).end()
  })

  return r
}
