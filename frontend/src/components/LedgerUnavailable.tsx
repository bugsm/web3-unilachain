import { RotateCw } from "lucide-react"
import { cx } from "./ui/cx"

/**
 * Rantai empat blok; sambungan ke blok terbaru putus dan blok itu hanya garis putus-putus (tidak terbaca).
 * Geometri murni: tiga blok utuh dengan isi (garis hash), dua ujung sambungan terputus bertanda silang, blok keempat kosong.
 */
function BrokenChain({ className }: { className?: string }) {
  const block = "fill-white/[0.04] stroke-white/30"
  const link = "stroke-white/40"
  return (
    <svg
      role="img"
      aria-label="Ilustrasi rantai blok terputus: tiga blok tersambung, blok terbaru terlepas dan tidak terbaca"
      viewBox="0 0 560 120"
      className={cx("h-auto w-full", className)}
      fill="none"
      strokeLinecap="round"
    >
      {[8, 152, 296].map((x) => (
        <g key={x} aria-hidden>
          <rect x={x} y={24} width={96} height={72} rx={12} strokeWidth={1.5} className={block} />
          <path d={`M${x + 16} 46h40M${x + 16} 60h56M${x + 16} 74h28`} strokeWidth={1.5} className="stroke-white/25" />
        </g>
      ))}

      {/* Sambungan utuh: blok 1 ke 2 dan 2 ke 3. */}
      <g aria-hidden strokeWidth={1.5} className={link}>
        <path d="M104 60h48M248 60h48" />
        <circle cx={104} cy={60} r={2.5} className="fill-ink" />
        <circle cx={152} cy={60} r={2.5} className="fill-ink" />
        <circle cx={248} cy={60} r={2.5} className="fill-ink" />
        <circle cx={296} cy={60} r={2.5} className="fill-ink" />
      </g>

      {/* Sambungan putus: dua ujung yang berkedip sekali, lalu tanda silang di celahnya. */}
      <g aria-hidden strokeWidth={1.5}>
        <path d="M392 60h12" className={cx(link, "link-flicker")} />
        <path d="M428 60h12" className={cx(link, "link-flicker")} />
        <path d="M411 53l10 14M421 53l-10 14" strokeWidth={2} className="stroke-[#ff8a99]" />
      </g>

      {/* Blok terbaru: hanya kerangka putus-putus. */}
      <g aria-hidden>
        <rect x={440} y={24} width={96} height={72} rx={12} strokeWidth={1.5} strokeDasharray="5 6" className="stroke-white/25" />
        <path d="M456 46h40M456 60h56M456 74h28" strokeWidth={1.5} strokeDasharray="2 6" className="stroke-white/15" />
      </g>
    </svg>
  )
}

/**
 * Keadaan "ledger tidak terjangkau" di latar gelap portal verifikasi (peer mati atau server tidak dapat menghubunginya).
 * Menjelaskan bahwa ini bukan putusan tentang SKPI-nya, dan bahwa status tidak pernah ditebak dari data lama.
 * Stiker di samping kartu (di bawahnya pada layar sempit) hanya hiasan, jadi alt kosong dan tidak dibacakan.
 */
export function LedgerUnavailable({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  return (
    <div className={cx("grid items-center gap-8 lg:grid-cols-12 lg:gap-6", className)}>
      <section role="alert" className="rounded-panel border border-white/10 bg-ink-2/80 p-6 sm:p-8 lg:col-span-8">
        <BrokenChain />
        <h2 className="display mt-8 text-2xl text-white sm:text-title">Ledger belum dapat dihubungi</h2>
        <p className="mt-3 max-w-[60ch] text-body text-white/65">
          Server belum bisa menjangkau jaringan blockchain, sehingga status SKPI belum bisa dibaca. Ini bukan berarti SKPI ini tidak sah.
          Status selalu dibaca langsung dari ledger, tidak pernah ditebak dari data lama.
        </p>
        {onRetry && (
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-ink transition-[translate,background-color] duration-150 ease-out-ui hover:-translate-y-px hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:translate-y-0"
            >
              <RotateCw size={15} /> Coba lagi
            </button>
            <span className="text-label text-white/45">Jika berlanjut, hubungi Biro Akademik dan Kemahasiswaan.</span>
          </div>
        )}
      </section>
      <img
        src="/error-sticker.jpeg"
        alt=""
        width={900}
        height={1125}
        decoding="async"
        className="w-full max-w-[220px] justify-self-end rotate-3 rounded-2xl border-4 border-white shadow-panel sm:max-w-[260px] lg:col-span-4 lg:max-w-[300px] lg:justify-self-center"
      />
    </div>
  )
}
