import type { Role } from "@/api/types"

/** Halaman pertama setelah masuk: tugas utama tiap peran. */
const HOME: Record<Role, string> = {
  admin: "/ikhtisar",
  dekan: "/antrean",
  rektor: "/antrean",
}

export const homeOf = (role: Role) => HOME[role]

/** Hanya path internal; tolak //host dan URL absolut. */
export function safeNext(v: string | null): string | null {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : null
}
