import type { ButtonHTMLAttributes, ReactNode } from "react"
import { LoaderCircle } from "lucide-react"
import { cx } from "./cx"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dangerSolid"
  size?: "sm" | "md" | "lg"
  loading?: boolean
  /** Teks saat loading; default hanya ikon putar. */
  loadingLabel?: ReactNode
}

/* Tekan: scale 0.97 160ms ease-out (Tailwind v4: properti `scale`, bukan `transform`). Hover hanya warna (Tailwind v4 menggerbangi hover ke perangkat ber-pointer). */
const press =
  "transition-[scale,background-color,border-color,color,box-shadow] duration-150 ease-out-ui active:scale-[0.97] disabled:active:scale-100"

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  loadingLabel,
  className,
  type = "button",
  disabled,
  children,
  ...props
}: ButtonProps) {
  const layer = "[grid-area:1/1] inline-flex items-center justify-center gap-2 transition-[opacity,filter] duration-200 ease-out-ui"
  return (
    <button
      type={type}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-grid place-items-center rounded-lg font-semibold whitespace-nowrap select-none focus-visible:ring-4 focus-visible:ring-[#2563EB]/20 focus-visible:outline-none disabled:cursor-not-allowed",
        press,
        loading ? "disabled:cursor-wait" : "disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-11 px-5 text-sm",
        variant === "primary" && "bg-[#1D4ED8] text-white hover:bg-[#1E40AF]",
        variant === "secondary" && "border border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        variant === "danger" && "border border-rose-200 bg-white text-[#E11D48] hover:bg-rose-50",
        variant === "dangerSolid" && "bg-[#E11D48] text-white hover:bg-[#BE123C]",
        className,
      )}
    >
      {/* Dua lapis bertumpuk: label dan status loading bergantian dengan crossfade + blur, lebar tetap. */}
      <span className={cx(layer, loading ? "opacity-0 blur-[2px]" : "opacity-100")}>{children}</span>
      <span aria-hidden className={cx(layer, loading ? "opacity-100" : "opacity-0 blur-[2px]")}>
        {loading && <LoaderCircle size={16} className="animate-spin" />}
        {loading && loadingLabel}
      </span>
    </button>
  )
}

export function IconButton({ label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cx(
        "grid size-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40",
        press,
        className,
      )}
    />
  )
}
