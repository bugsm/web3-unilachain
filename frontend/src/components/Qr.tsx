import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { cx } from "./ui/cx"

/** Kode QR sebagai SVG (tajam saat dicetak, tanpa kanvas). */
export function Qr({ value, label, className }: { value: string; label: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }).then(
      (s) => alive && setSvg(s),
      () => alive && setSvg(null),
    )
    return () => {
      alive = false
    }
  }, [value])
  if (!svg) return <div className={cx("bg-canvas", className)} aria-hidden />
  return <div role="img" aria-label={label} className={cx("[&>svg]:size-full", className)} dangerouslySetInnerHTML={{ __html: svg }} />
}
