import { Link } from "react-router"
import { useSession } from "@/app/session"
import { Brand } from "./ui/Brand"

const button =
  "inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-900 transition-[scale,background-color,border-color] duration-150 ease-out-ui hover:border-slate-300 hover:bg-slate-50 active:scale-[0.97]"

export function PublicNav() {
  const { user } = useSession()
  return (
    <header className="border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <Link to="/verifikasi" aria-label="Portal verifikasi">
          <Brand />
        </Link>
        <div className="flex items-center gap-6">
          <span className="hidden text-sm text-slate-500 md:inline">Portal Verifikasi SKPI</span>
          <Link to={user ? "/ikhtisar" : "/masuk"} className={button}>
            {user ? "Kembali ke ruang kerja" : "Masuk staf"}
          </Link>
        </div>
      </div>
    </header>
  )
}
