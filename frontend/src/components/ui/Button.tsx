import type { ButtonHTMLAttributes, ReactNode } from "react"
import { LoaderCircle } from "lucide-react"
import { Link, type LinkProps } from "react-router"
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
  "transition-[scale,translate,background-color,border-color,color,box-shadow] duration-150 ease-out-ui active:scale-[0.985] disabled:active:scale-100"
/* Tombol berisi: naik 1px saat hover (pointer halus), kembali saat ditekan. */
const lift = "[@media(hover:hover)]:hover:-translate-y-px active:translate-y-0 disabled:hover:translate-y-0"

type Variant = NonNullable<ButtonProps["variant"]>
type Size = NonNullable<ButtonProps["size"]>

export function buttonClass(variant: Variant = "secondary", size: Size = "md") {
  return cx(
    "place-items-center rounded-lg font-semibold whitespace-nowrap select-none focus-visible:ring-[3px] focus-visible:ring-gold/60 focus-visible:outline-none disabled:cursor-not-allowed",
    press,
    size === "sm" && "h-8 px-3 text-[13px]",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-11 px-5 text-sm",
    variant === "primary" && cx("bg-brand text-white shadow-[0_1px_2px_rgb(12_10_8/0.2)] hover:bg-brand-strong", lift),
    variant === "secondary" && cx("border border-slate-300 bg-white text-ink hover:border-slate-400 hover:bg-canvas", lift),
    variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-ink",
    variant === "danger" && "border border-bad/25 bg-white text-bad hover:bg-bad-soft",
    variant === "dangerSolid" && "bg-bad text-white hover:bg-[#9a1d28]",
  )
}

/** Tautan rute yang tampil seperti tombol. */
export function LinkButton({
  variant,
  size,
  className,
  ...props
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={cx(buttonClass(variant, size), "inline-flex items-center gap-2", className)} />
}

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
        buttonClass(variant, size),
        "inline-grid",
        loading ? "disabled:cursor-wait" : "disabled:opacity-50",
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
        "grid size-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink disabled:opacity-40",
        press,
        className,
      )}
    />
  )
}
