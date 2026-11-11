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
          <p className="mb-3 flex items-center gap-2 text-label text-slate-500"><span aria-hidden className="size-1.5 rounded-full bg-gold" />{eyebrow}</p>
        )}
        <h1 className="display text-title text-ink sm:text-display-sm">
          {title}
        </h1>
        {description && <p className="mt-3 max-w-2xl text-body leading-relaxed text-slate-500">{description}</p>}
      </div>
      {actions && (
        <div className="col-span-12 flex flex-wrap items-center gap-3 lg:col-span-4 lg:justify-end">{actions}</div>
      )}
    </header>
  )
}

export function SectionTitle({ title, aside, id }: { title: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-5">
      <h2 id={id} className="text-sm font-semibold text-ink">
        {title}
      </h2>
      {aside}
    </div>
  )
}

export const th =
  "h-10 px-4 text-left text-xs font-medium whitespace-nowrap text-slate-500"
export const td = "px-4 py-3.5 align-middle"
