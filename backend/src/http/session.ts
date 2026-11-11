import type { NextFunction, Request, RequestHandler, Response } from "express"
import jwt from "jsonwebtoken"
import type { Config } from "../config.js"
import type { Queryable } from "../db/pool.js"
import { users, type UserRow } from "../db/repos/users.js"
import type { Role } from "../types.js"
import { ApiError } from "./errors.js"

export const COOKIE = "skpi_session"
const MAX_AGE_S = 8 * 60 * 60

declare module "express-serve-static-core" {
  interface Request {
    account?: UserRow
  }
}

export function issueSession(res: Response, config: Config, userId: string) {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { algorithm: "HS256", expiresIn: MAX_AGE_S })
  res.cookie(COOKIE, token, { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", path: "/", maxAge: MAX_AGE_S * 1000 })
}

export function clearSession(res: Response, config: Config) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", path: "/" })
}

const UNAUTHENTICATED = () => new ApiError(401, "UNAUTHENTICATED", "Sesi berakhir, silakan masuk kembali.")

/** Muat akun dari cookie; akun yang dinonaktifkan langsung kehilangan sesinya. */
export function requireUser(config: Config, db: Queryable, ...roles: Role[]): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[COOKIE]
    if (!token) return next(UNAUTHENTICATED())
    let sub: string
    try {
      sub = String((jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload).sub)
    } catch {
      return next(UNAUTHENTICATED())
    }
    const row = await users.findById(db, sub)
    if (!row || !row.active) return next(UNAUTHENTICATED())
    if (roles.length && !roles.includes(row.role)) return next(new ApiError(403, "FORBIDDEN", "Anda tidak berwenang untuk tindakan ini."))
    req.account = row
    next()
  }
}
