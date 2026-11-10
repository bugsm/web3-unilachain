import { useEffect, useState, type ReactNode } from "react"
import { NavLink, useLocation } from "react-router"
import { ArrowUpRight, FilePlus2, History, Inbox, LayoutGrid, LogOut, Menu, X, type LucideIcon } from "lucide-react"
import type { Role, User } from "@/api/types"
import { useApi } from "@/app/ApiProvider"
import { useSession, useUser } from "@/app/session"
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
    <div className="flex h-full flex-col bg-[#0F172A] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-slate-300">
      <div className="flex h-16 items-center justify-between px-5">
        <Brand dark />
        {onClose && (
          <IconButton label="Tutup menu" onClick={onClose} className="text-slate-400 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </IconButton>
        )}
      </div>

      <nav aria-label="Navigasi utama" className="mt-6 flex-1 px-3">
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">Ruang kerja</p>
        <ul className="space-y-0.5">
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                onClick={onNavigate}
                className={({ isActive }) => cx(item, isActive && "bg-[#1E293B] font-semibold text-white hover:bg-[#1E293B]")}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[#2563EB]" />}
                    <n.icon size={18} className={isActive ? "text-[#60A5FA]" : "text-slate-500"} />
                    <span className="flex-1 text-left">{n.label}</span>
                    {n.to === "/antrean" && pending > 0 && (
                      <span className="rounded bg-[#D97706]/20 px-1.5 py-0.5 text-[11px] font-semibold text-[#FBBF24] tabular-nums">
                        {pending}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <p className="mt-8 px-3 pb-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500 uppercase">
          Layanan publik
        </p>
        <NavLink to="/verifikasi" onClick={onNavigate} className={item}>
          <ArrowUpRight size={18} className="text-slate-500" />
          <span className="flex-1 text-left">Portal verifikasi</span>
        </NavLink>
      </nav>

      <div className="flex items-center gap-3 border-t border-white/10 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1E293B] text-xs font-semibold text-white">
          {INITIALS[user.role]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{user.name}</p>
          <p className="truncate font-mono text-[11px] text-slate-400">{user.actorId}</p>
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

function useLedgerInfo() {
  const api = useApi()
  const [info, setInfo] = useState<{ channel: string; msp: string } | null>(null)
  useEffect(() => {
    api.ledgerInfo().then(setInfo, () => undefined)
  }, [api])
  return info
}

export function Shell({ children }: { children: ReactNode }) {
  const user = useUser()
  const { pathname } = useLocation()
  const pending = useQueueCount(user.role, pathname)
  const info = useLedgerInfo()
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobile = useExitTransition(mobileOpen, 200)
  const close = () => setMobileOpen(false)

  return (
    <div className="min-h-dvh bg-white">
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
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-10">
            <IconButton label="Buka menu" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu size={19} />
            </IconButton>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-slate-400 sm:inline">{info?.msp ?? "UnilaMSP"}</span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <span className="hidden truncate text-slate-500 sm:inline">{unitOf(user)}</span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <span className="truncate font-semibold text-slate-900">{titleOf(pathname)}</span>
            </nav>
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#059669] opacity-40" />
                <span className="relative inline-flex size-2 rounded-full bg-[#059669]" />
              </span>
              <span className="hidden font-mono sm:inline">
                {info ? `${info.channel} · ${info.msp}` : "menghubungkan…"}
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          {/* Pindah halaman sering terjadi: hanya opacity 120ms, tanpa geser. */}
          <div key={pathname.split("/")[1]} className="transition-opacity duration-[120ms] ease-out-ui starting:opacity-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
