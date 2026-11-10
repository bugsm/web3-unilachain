import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react"
import { CircleAlert } from "lucide-react"
import { cx } from "./cx"

const control =
  "w-full rounded-lg border bg-white text-sm text-slate-900 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10 read-only:bg-slate-50 read-only:text-slate-500"

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
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#E11D48]">
          <CircleAlert size={13} className="shrink-0" />
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  )
}

type Invalid = { invalid?: boolean }

export function Input({ invalid, className, ...props }: InputHTMLAttributes<HTMLInputElement> & Invalid) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cx(control, "h-10 px-3", invalid ? "border-rose-300" : "border-slate-200", className)}
    />
  )
}

export function Select({ invalid, className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & Invalid) {
  return (
    <select
      {...props}
      aria-invalid={invalid || undefined}
      className={cx(control, "h-10 px-3", invalid ? "border-rose-300" : "border-slate-200", className)}
    />
  )
}

export function Textarea({ invalid, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & Invalid) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || undefined}
      className={cx(
        control,
        "min-h-24 resize-y px-3 py-2.5 leading-relaxed",
        invalid ? "border-rose-300" : "border-slate-200",
        className,
      )}
    />
  )
}
