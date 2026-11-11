import { Navigate, Outlet, Route, Routes, useLocation } from "react-router"
import { NAV, Shell } from "@/components/Shell"
import { ApprovalsScreen } from "@/screens/approvals/ApprovalsScreen"
import { Login } from "@/screens/Login"
import { OfficialsScreen } from "@/screens/officials/OfficialsScreen"
import { Overview } from "@/screens/Overview"
import { RecordScreen } from "@/screens/record/RecordScreen"
import { RegistryScreen } from "@/screens/registry/RegistryScreen"
import { PublicVerify } from "@/screens/verify/PublicVerify"
import { VerifyResult } from "@/screens/verify/VerifyResult"
import { useSession } from "./session"

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

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/verifikasi" replace />} />
      <Route path="/masuk" element={<Login />} />
      <Route path="/verifikasi" element={<PublicVerify />} />
      <Route path="/verifikasi/:npm" element={<VerifyResult />} />
      <Route element={<RequireStaff />}>
        <Route element={<StaffLayout />}>
          <Route path="/ikhtisar" element={<Overview />} />
          <Route path="/daftar" element={<RegistryScreen />} />
          <Route path="/daftar/:npm" element={<RegistryScreen />} />
          <Route path="/catat" element={<RecordScreen />} />
          <Route path="/antrean" element={<ApprovalsScreen />} />
          <Route path="/pejabat" element={<OfficialsScreen />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/verifikasi" replace />} />
    </Routes>
  )
}
