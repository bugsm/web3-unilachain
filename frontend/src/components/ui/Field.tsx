import {
  createContext,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react"
import { CircleAlert } from "lucide-react"
import { cx } from "./cx"

const control =
  "w-full rounded-lg border bg-white text-sm text-slate-900 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10 read-only:bg-slate-50 read-only:text-slate-500"

interface FieldIds {
  id: string
  describedBy: string | undefined
  invalid: boolean
}
const FieldContext = createContext<FieldIds | null>(null)

/** Label terhubung lewat htmlFor; hint/galat menjadi aria-describedby, bukan bagian nama input. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  children: ReactNode
  className?: string
}) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error || hint
  return (
    <div className={cx("block", className)}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-slate-700">
        {label}
      </label>
      <FieldContext.Provider value={{ id, describedBy: note ? noteId : undefined, invalid: !!error }}>
        {children}
      </FieldContext.Provider>
      {error ? (
        <span id={noteId} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#E11D48]">
          <CircleAlert size={13} className="shrink-0" />
          {error}
        </span>
      ) : hint ? (
        <span id={noteId} className="mt-1.5 block text-xs text-slate-500">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

type Invalid = { invalid?: boolean }

function useFieldProps(invalid: boolean | undefined, id: string | undefined) {
  const f = useContext(FieldContext)
  const bad = invalid ?? f?.invalid ?? false
  return {
    id: id ?? f?.id,
    "aria-describedby": f?.describedBy,
    "aria-invalid": bad || undefined,
    bad,
  }
}

export function Input({ invalid, className, id, ...props }: InputHTMLAttributes<HTMLInputElement> & Invalid) {
  const { bad, ...field } = useFieldProps(invalid, id)
  return (
    <input
      {...field}
      {...props}
      className={cx(control, "h-10 px-3", bad ? "border-rose-300" : "border-slate-200", className)}
    />
  )
}

export function Select({ invalid, className, id, ...props }: SelectHTMLAttributes<HTMLSelectElement> & Invalid) {
  const { bad, ...field } = useFieldProps(invalid, id)
  return (
    <select
      {...field}
      {...props}
      className={cx(control, "h-10 px-3", bad ? "border-rose-300" : "border-slate-200", className)}
    />
  )
}

export function Textarea({ invalid, className, id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & Invalid) {
  const { bad, ...field } = useFieldProps(invalid, id)
  return (
    <textarea
      {...field}
      {...props}
      className={cx(
        control,
        "min-h-24 resize-y px-3 py-2.5 leading-relaxed",
        bad ? "border-rose-300" : "border-slate-200",
        className,
      )}
    />
  )
}
