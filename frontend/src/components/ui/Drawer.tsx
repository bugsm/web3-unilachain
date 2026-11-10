import type { ReactNode } from "react"
import { X } from "lucide-react"
import { useExitTransition } from "../useExitTransition"
import { IconButton } from "./Button"
import { cx } from "./cx"
import { useEscape, useFocusReturn } from "./Modal"

const DRAWER_EXIT_MS = 200

export function Drawer({
  open,
  onClose,
  label,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
  footer?: ReactNode
}) {
  const { mounted, state } = useExitTransition(open, DRAWER_EXIT_MS)
  const panel = useFocusReturn(open)
  useEscape(open, onClose)
  if (!mounted) return null
  return (
    <div
      data-state={state}
      className="fixed inset-0 z-[60] flex justify-end bg-slate-900/30 transition-opacity duration-300 ease-out-ui starting:opacity-0 data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0 data-[state=closed]:duration-200"
      onMouseDown={onClose}
    >
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-state={state}
        className={cx(
          "flex h-full w-full max-w-[540px] flex-col bg-white shadow-2xl shadow-slate-900/20 outline-none",
          // Kurva drawer ala iOS, 300ms masuk; keluar 200ms.
          "transition-transform duration-300 ease-drawer starting:translate-x-full",
          "data-[state=closed]:translate-x-full data-[state=closed]:duration-200",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative flex-1 overflow-y-auto overscroll-contain">
          <IconButton label="Tutup" onClick={onClose} className="absolute top-5 right-5">
            <X size={18} />
          </IconButton>
          {children}
        </div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8">
            {footer}
          </div>
        )}
      </aside>
    </div>
  )
}
