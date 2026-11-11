import { useEffect, useState, type ReactNode } from "react"
import { NavLink, useLocation } from "react-router"
import { ArrowUpRight, FilePlus2, History, Inbox, LayoutGrid, LogOut, Menu, UserRoundPen, X, type LucideIcon } from "lucide-react"
import type { Role, User } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { useSession, useUser } from "@/app/session"
import { ChainStatus } from "./ChainStatus"
import { useExitTransition } from "./useExitTransition"
import { Brand } from "./ui/Brand"
import { IconButton } from "./ui/Button"
import { cx } from "./ui/cx"

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
}

export const NAV: NavItem[] = [
  { to: "/ikhtisar", label: "Ikhtisar", icon: LayoutGrid, roles: ["admin", "dekan", "rektor"] },
  { to: "/catat", label: "Catat SKPI", icon: FilePlus2, roles: ["admin"] },
  { to: "/antrean", label: "Antrean pengesahan", icon: Inbox, roles: ["dekan", "rektor"] },
  { to: "/daftar", label: "Daftar & riwayat", icon: History, roles: ["admin", "dekan", "rektor"] },
  { to: "/pejabat", label: "Pejabat", icon: UserRoundPen, roles: ["admin", "dekan", "rektor"] },
]

const INITIALS: Record<Role, string> = { admin: "AF", dekan: "DK", rektor: "RK" }

export function unitOf(user: User) {
  if (user.role === "rektor") return "Universitas Lampung"
  return user.role === "admin" ? `Admin ${user.faculty}` : (user.faculty ?? "")
}

function titleOf(pathname: string) {
  return NAV.find((n) => pathname.startsWith(n.to))?.label ?? ""
}

function Sidebar({ pending, onNavigate, onClose }: { pending: number; onNavigate?: () => void; onClose?: () => void }) {
  const user = useUser()
  const { logout } = useSession()
  const item =
    "relative flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150 hover:bg-white/5 hover:text-white"
  return (
    <div className="flex h-full flex-col bg-ink pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white/75">
      <div aria-hidden className="h-0.5 bg-gold" />
      <div className="flex h-16 items-center justify-between px-5">
        <Brand dark />
        {onClose && (
          <IconButton label="Tutup menu" onClick={onClose} className="text-slate-400 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </IconButton>
        )}
      </div>

      <nav aria-label="Navigasi utama" className="mt-6 flex-1 px-3">
        <p className="px-3 pb-2 text-xs text-white/45">Ruang kerja</p>
        <ul className="space-y-0.5">
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                onClick={onNavigate}
                className={({ isActive }) => cx(item, isActive && "bg-white/[0.08] font-medium text-white hover:bg-white/[0.08]")}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gold" />}
                    <n.icon size={18} className={isActive ? "text-white" : "text-white/45"} />
                    <span className="flex-1 text-left">{n.label}</span>
                    {n.to === "/antrean" && pending > 0 && (
                      <span className="rounded-full bg-gold px-1.5 py-0.5 text-[11px] font-semibold text-ink tabular-nums">
                        {pending}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <p className="mt-8 px-3 pb-2 text-xs text-white/45">
          Layanan publik
        </p>
        <NavLink to="/verifikasi" onClick={onNavigate} className={item}>
          <ArrowUpRight size={18} className="text-white/45" />
          <span className="flex-1 text-left">Portal verifikasi</span>
        </NavLink>
      </nav>

      <div className="mx-4 mb-4 rounded-lg border border-white/10 px-3.5 py-3">
        <ChainStatus tone="dark" detailed />
      </div>
      <div className="flex items-center gap-3 border-t border-white/10 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">
          {INITIALS[user.role]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{user.name}</p>
          <p className="truncate font-mono text-[11px] text-white/50">{user.actorId}</p>
        </div>
        <IconButton label="Keluar" onClick={() => void logout()} className="text-slate-400 hover:bg-white/10 hover:text-white">
          <LogOut size={17} />
        </IconButton>
      </div>
    </div>
  )
}

/** Jumlah antrean untuk lencana; dimuat ulang setiap pindah halaman. */
function useQueueCount(role: Role, pathname: string) {
  const api = useApi()
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (role === "admin") return
    let alive = true
    api
      .listQueue()
      .then((q) => alive && setCount(q.length))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [api, role, pathname])
  return count
}

export function Shell({ children }: { children: ReactNode }) {
  const user = useUser()
  const { pathname } = useLocation()
  const pending = useQueueCount(user.role, pathname)
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobile = useExitTransition(mobileOpen, 200)
  const close = () => setMobileOpen(false)

  return (
    <div className="min-h-dvh bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <Sidebar pending={pending} />
      </aside>

      {mobile.mounted && (
        <div
          data-state={mobile.state}
          className="fixed inset-0 z-50 bg-slate-900/40 transition-opacity duration-250 ease-out-ui starting:opacity-0 data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0 data-[state=closed]:duration-200 lg:hidden"
          onClick={close}
        >
          <aside
            data-state={mobile.state}
            className="h-full w-72 transition-[translate] duration-250 ease-drawer starting:-translate-x-full data-[state=closed]:-translate-x-full data-[state=closed]:duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar pending={pending} onClose={close} onNavigate={close} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-10">
            <IconButton label="Buka menu" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu size={19} />
            </IconButton>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-slate-400 sm:inline">UnilaMSP</span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <span className="hidden truncate text-slate-500 sm:inline">{unitOf(user)}</span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <span className="truncate font-semibold text-ink">{titleOf(pathname)}</span>
            </nav>
            {/* Desktop: status lengkap ada di sidebar. */}
            <ChainStatus className="ml-auto lg:hidden" />
          </div>
        </header>
        <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          {/* Pindah halaman sering terjadi: hanya opacity 120ms, tanpa geser. */}
          <div key={pathname.split("/")[1]} className="transition-opacity duration-[120ms] ease-out-ui starting:opacity-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
