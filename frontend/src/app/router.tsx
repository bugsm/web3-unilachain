import type { ReactNode } from "react"
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router"
import { PublicNav } from "@/components/PublicNav"
import { NAV, Shell } from "@/components/Shell"
import { ApprovalsScreen } from "@/screens/approvals/ApprovalsScreen"
import { Login } from "@/screens/Login"
import { Overview } from "@/screens/Overview"
import { RecordScreen } from "@/screens/record/RecordScreen"
import { useSession } from "./session"

/** Pengganti sementara layar yang dibangun di task berikutnya. */
function Pending({ title, publicPage = false }: { title: string; publicPage?: boolean }) {
  const heading = <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-slate-900">{title}</h1>
  if (!publicPage) return heading
  return (
    <div className="min-h-dvh bg-white">
      <PublicNav />
      <main className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 lg:px-10">{heading}</main>
    </div>
  )
}

function Splash() {
  return <div className="min-h-dvh bg-[#F8FAFC]" aria-busy="true" />
}

/** Sesi wajib; peran diperiksa terhadap NAV sebelum Shell dirender. */
function RequireStaff() {
  const { user, loading } = useSession()
  const location = useLocation()
  if (loading) return <Splash />
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/masuk?next=${next}`} replace />
  }
  const item = NAV.find((n) => location.pathname.startsWith(n.to))
  if (item && !item.roles.includes(user.role)) return <Navigate to="/ikhtisar" replace />
  return <Outlet />
}

function StaffLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  )
}

const screens: Record<string, ReactNode> = {
  login: <Login />,
  overview: <Overview />,
  record: <RecordScreen />,
  approvals: <ApprovalsScreen />,
  registry: <Pending title="Daftar & riwayat" />,
  verify: <Pending title="Periksa keabsahan SKPI lulusan Universitas Lampung." publicPage />,
  result: <Pending title="Hasil verifikasi" publicPage />,
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/verifikasi" replace />} />
      <Route path="/masuk" element={screens.login} />
      <Route path="/verifikasi" element={screens.verify} />
      <Route path="/verifikasi/:npm" element={screens.result} />
      <Route element={<RequireStaff />}>
        <Route element={<StaffLayout />}>
          <Route path="/ikhtisar" element={screens.overview} />
          <Route path="/daftar" element={screens.registry} />
          <Route path="/daftar/:npm" element={screens.registry} />
          <Route path="/catat" element={screens.record} />
          <Route path="/antrean" element={screens.approvals} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/verifikasi" replace />} />
    </Routes>
  )
}
