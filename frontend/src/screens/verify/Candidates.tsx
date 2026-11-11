import { Link } from "react-router"
import { ChevronRight } from "lucide-react"
import type { VerifyCandidate } from "@/api/types"
import { facultyByCode } from "@/domain/faculty"

export function Candidates({ q, candidates, truncated }: { q: string; candidates: VerifyCandidate[]; truncated: boolean }) {
  return (
    <section className="mt-4 overflow-hidden rounded-2xl bg-white text-ink shadow-[0_24px_60px_-30px_rgb(0_0_0/0.6)]">
      <p className="border-b border-line px-5 py-3 text-sm text-slate-600">
        {candidates.length ? (
          <>
            <span className="font-semibold text-ink tabular-nums">{candidates.length}</span> lulusan cocok dengan “{q}”. Pilih yang
            sesuai dengan NPM pada dokumen.
          </>
        ) : (
          <>Tidak ada lulusan terdaftar dengan nama “{q}”. Periksa ejaan atau gunakan NPM.</>
        )}
      </p>
      {candidates.length > 0 && (
        <ul aria-label="Kandidat lulusan" className="divide-y divide-line">
          {candidates.map((c) => (
            <li key={c.npm}>
              <Link
                to={`/verifikasi/${c.npm}`}
                className="flex items-center justify-between gap-4 px-5 py-3 transition-colors duration-150 hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{c.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {c.programStudy} · {facultyByCode(c.facultyCode).name}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 font-mono text-sm text-slate-700 tabular-nums">
                  {c.npm}
                  <ChevronRight size={16} className="text-slate-400" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {truncated && (
        <p className="border-t border-line px-5 py-3 text-xs text-slate-500">Hasil dibatasi 10, perjelas nama atau gunakan NPM</p>
      )}
    </section>
  )
}
