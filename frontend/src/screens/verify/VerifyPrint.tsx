import type { ReactNode } from "react"
import type { VerifyResult, VerifyStatus } from "@/api/types"
import { formatBlock } from "@/components/ChainStatus"
import { Qr } from "@/components/Qr"
import { Logo } from "@/components/ui"
import { compactStamp, formatDateTime } from "@/domain/format"

/*
 * Lembar cetak hasil verifikasi: dokumen formal satu lembar A4.
 * @page bermargin 0 (index.css) sehingga browser tidak mencetak tanggal/URL di tepi; margin diatur di sini.
 * Serif dokumen (Times New Roman / Georgia, tersedia di semua mesin cetak), hitam di atas putih, tanpa kotak berwarna.
 * Teks sengaja berbeda dari layar web agar tidak ada duplikat bagi pembaca layar dan test.
 */

const VERDICT: Record<VerifyStatus, { title: string; meaning: string }> = {
  TERDAFTAR: { title: "TERDAFTAR", meaning: "telah disahkan Dekan dan Rektor serta masih berlaku" },
  DICABUT: { title: "DICABUT", meaning: "pernah disahkan, tetapi telah dicabut dan tidak lagi berlaku" },
  BELUM_SAH: { title: "BELUM SAH", meaning: "telah disahkan Dekan, tetapi belum disahkan Rektor" },
  TIDAK_TERDAFTAR: { title: "TIDAK TERDAFTAR", meaning: "tidak ditemukan sebagai SKPI yang sah di ledger" },
}

const serif = { fontFamily: '"Times New Roman", Times, Georgia, serif' }

function Item({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt className="py-[0.5mm]">{k}</dt>
      <dd className="py-[0.5mm]">:</dd>
      <dd className="py-[0.5mm] break-words">{children}</dd>
    </>
  )
}

export function VerifyPrint({
  npm,
  result,
  checkedAt,
  latestBlock,
  url,
}: {
  npm: string
  result: VerifyResult
  checkedAt: string
  latestBlock: number | null
  url: string
}) {
  const v = VERDICT[result.status]
  const skpi = result.data
  const ref = `VRF/${npm}/${compactStamp(checkedAt)}`
  const cell = "border border-black px-[2.5mm] py-[1.4mm] align-top"

  return (
    <article
      role="document"
      aria-label="Hasil Verifikasi SKPI"
      style={serif}
      className="hidden h-[297mm] w-[210mm] flex-col overflow-hidden bg-white px-[22mm] pt-[12mm] pb-[10mm] text-[11pt] leading-[1.4] text-black print:flex"
    >
      {/* Kop surat */}
      <div className="flex items-center gap-[5mm]">
        <span className="size-[21mm] shrink-0">
          <Logo />
        </span>
        <div className="flex-1 text-center">
          <p className="text-[16pt] leading-tight font-bold tracking-[0.03em]">UNIVERSITAS LAMPUNG</p>
          <p className="text-[12.5pt] leading-tight font-bold">BIRO AKADEMIK DAN KEMAHASISWAAN</p>
          <p className="mt-[1mm] text-[10pt] leading-snug">Jalan Prof. Dr. Ir. Sumantri Brojonegoro No. 1, Bandar Lampung 35145</p>
          <p className="text-[10pt] leading-snug">Portal Verifikasi Surat Keterangan Pendamping Ijazah (SKPI)</p>
        </div>
        <span className="w-[21mm] shrink-0" aria-hidden />
      </div>
      <div aria-hidden className="mt-[3mm] border-t-[2.4pt] border-black" />
      <div aria-hidden className="mt-[0.7mm] border-t-[0.8pt] border-black" />

      <div className="mt-[5mm] text-center">
        <p className="text-[13pt] font-bold underline underline-offset-[1.5mm]">HASIL VERIFIKASI SKPI</p>
        <p className="mt-[1.5mm] text-[11pt]">Nomor referensi {ref}</p>
      </div>

      <p className="mt-[5mm] text-justify">
        Pada {formatDateTime(checkedAt)}, Surat Keterangan Pendamping Ijazah (SKPI) dengan Nomor Pokok Mahasiswa {npm} telah diperiksa
        pada ledger Hyperledger Fabric Universitas Lampung dengan hasil sebagai berikut:
      </p>

      <dl className="mt-[3mm] ml-[8mm] grid grid-cols-[48mm_4mm_1fr]">
        {skpi && (
          <>
            <Item k="Nama lulusan">{skpi.name}</Item>
            <Item k="Nomor Pokok Mahasiswa">{skpi.npm}</Item>
            <Item k="Nomor SKPI">{skpi.skpiId}</Item>
            <Item k="Program studi">{skpi.programStudy}</Item>
            <Item k="Total SKP / predikat">
              {skpi.totalSKP} / {skpi.predicate}
            </Item>
            <Item k="Diterbitkan oleh">{skpi.issuer}</Item>
          </>
        )}
        {!skpi && <Item k="Nomor Pokok Mahasiswa">{npm}</Item>}
        <Item k="Status">
          <b>{v.title}</b>, {v.meaning}.
        </Item>
      </dl>

      {skpi ? (
        <>
          <p className="mt-[4mm]">Pengesahan yang tercatat di ledger:</p>
          <table className="mt-[2mm] w-full border-collapse text-[10.5pt]">
            <thead>
              <tr>
                <th className={`${cell} w-[22mm] text-left font-bold`}>Tahap</th>
                <th className={`${cell} text-left font-bold`}>Pejabat</th>
                <th className={`${cell} w-[46mm] text-left font-bold`}>Waktu pengesahan</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={cell}>1. Dekan</td>
                <td className={cell}>
                  {result.dekanName ?? skpi.issuer}
                  {result.dekanName && <span className="block">{skpi.issuer}</span>}
                </td>
                <td className={`${cell} whitespace-nowrap`}>{formatDateTime(skpi.issuedTimestamp)}</td>
              </tr>
              <tr>
                <td className={cell}>2. Rektor</td>
                <td className={cell}>
                  {result.rektorName ?? "Rektor Universitas Lampung"}
                  {result.rektorName && <span className="block">Rektor Universitas Lampung</span>}
                </td>
                <td className={`${cell} whitespace-nowrap`}>{formatDateTime(skpi.rektorTimestamp)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-[2mm] text-[10pt] text-justify">
            Kedua pengesahan ditandatangani secara digital dengan sertifikat X.509 milik masing-masing pejabat (organisasi UnilaMSP) dan
            tersimpan sebagai transaksi di ledger.
          </p>
        </>
      ) : (
        <p className="mt-[4mm] text-justify">
          Pastikan NPM sama persis dengan yang tercetak pada dokumen. Bila sudah benar, mintalah konfirmasi ke Biro Akademik dan
          Kemahasiswaan Universitas Lampung dengan menyebut nomor referensi di atas.
        </p>
      )}

      {/* Rincian pemeriksaan + QR, didorong ke bagian bawah lembar. */}
      <div className="mt-auto flex items-end gap-[8mm] pt-[5mm]">
        <div className="flex-1 text-[10pt]">
          <p className="font-bold">Rincian pemeriksaan</p>
          <dl className="mt-[1mm] grid grid-cols-[48mm_4mm_1fr]">
            <Item k="Waktu pemeriksaan">{formatDateTime(checkedAt)}</Item>
            <Item k="Jaringan">Hyperledger Fabric, kanal skpi-channel</Item>
            <Item k="Blok terbaru saat diperiksa">{latestBlock !== null ? formatBlock(latestBlock) : "tidak tersedia"}</Item>
            <Item k="Periksa ulang di">{url}</Item>
          </dl>
          <p className="mt-[2.5mm] text-justify">
            Lembar ini mencatat hasil pemeriksaan pada waktu di atas dan bukan pengganti SKPI asli. Status dapat berubah, misalnya
            dicabut; pindai kode QR di samping untuk melihat status terkini.
          </p>
        </div>
        <Qr value={url} label="Kode QR verifikasi" className="size-[27mm] shrink-0" />
      </div>

      <div className="mt-[4mm] flex justify-between border-t-[0.6pt] border-black pt-[1.5mm] text-[8.5pt]">
        <span>Dicetak dari Portal Verifikasi SKPI Universitas Lampung</span>
        <span>{ref}</span>
      </div>
    </article>
  )
}
