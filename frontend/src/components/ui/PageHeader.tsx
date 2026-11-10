import type { ReactNode } from "react"

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-10 grid grid-cols-12 items-end gap-6">
      <div className="col-span-12 lg:col-span-8">
        {eyebrow && (
          <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">{eyebrow}</p>
        )}
        <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-slate-900 sm:text-[32px]">
          {title}
        </h1>
        {description && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-500">{description}</p>}
      </div>
      {actions && (
        <div className="col-span-12 flex flex-wrap items-center gap-3 lg:col-span-4 lg:justify-end">{actions}</div>
      )}
    </header>
  )
}

export function SectionTitle({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-200 px-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {aside}
    </div>
  )
}

export const th =
  "h-10 px-4 text-left text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-slate-500 uppercase"
export const td = "px-4 py-3.5 align-middle"
