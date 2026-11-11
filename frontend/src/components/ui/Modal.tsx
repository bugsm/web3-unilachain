import { useEffect, useId, useRef, type ReactNode } from "react"
import { X } from "lucide-react"
import { useExitTransition } from "../useExitTransition"
import { IconButton } from "./Button"
import { cx } from "./cx"

export function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])
}

/** Fokus ke panel saat dibuka, kembali ke pemicu saat ditutup. */
export function useFocusReturn(open: boolean) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const trigger = document.activeElement as HTMLElement | null
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus()
    return () => trigger?.focus?.()
  }, [open])
  return panel
}

const MODAL_EXIT_MS = 150

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  const { mounted, state } = useExitTransition(open, MODAL_EXIT_MS)
  const titleId = useId()
  const panel = useFocusReturn(open)
  useEscape(open, onClose)
  if (!mounted) return null
  return (
    <div
      data-state={state}
      className={cx(
        "fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 sm:p-6",
        "transition-opacity duration-200 ease-out-ui starting:opacity-0 data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0 data-[state=closed]:duration-150",
      )}
      onMouseDown={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-state={state}
        className={cx(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl shadow-slate-900/20 outline-none",
          // Masuk: opacity + scale(0.96) → 1, 200ms. Keluar lebih cepat, 150ms. Origin tengah (modal tidak berjangkar).
          "transition-[opacity,scale] duration-200 ease-out-ui starting:scale-[0.96] starting:opacity-0",
          "data-[state=closed]:scale-[0.96] data-[state=closed]:opacity-0 data-[state=closed]:duration-150",
          width,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-6 border-b border-line px-6 py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>}
          </div>
          <IconButton label="Tutup" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line bg-slate-50 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
