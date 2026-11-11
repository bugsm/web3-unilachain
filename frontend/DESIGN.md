# Sistem ukuran frontend SKPI

Sumber kebenaran: token di `src/index.css` (`@theme`). Penjaga: `src/designSystem.test.ts` (gagal bila ada nilai px lepas).
Lembar cetak `VerifyPrint.tsx` dikecualikan karena memakai satuan cetak (mm/pt).

## Teks

| Kelas | px | Peran |
|---|---|---|
| `text-xs` | 12 | keterangan, lencana, meta |
| `text-label` | 13 | label isian, teks bantu |
| `text-sm` | 14 | tabel, tombol, teks rapat |
| `text-body` | 15 | isi utama |
| `text-base` | 16 | judul modal |
| `text-lead` | 17 | paragraf pembuka hero |
| `text-xl` / `text-2xl` | 20 / 24 | nama pada kartu, judul drawer |
| `text-title` | 28 | judul bagian dan kartu |
| `text-display-sm` | 40 | judul halaman staf, hero ponsel |
| `text-display-md` | 48 | hero tablet, angka statistik |
| `text-display-lg` | 56 | hero desktop |
| `text-display-xl` | 64 | putusan hasil verifikasi |

Judul memakai kelas `.display` (bobot 500, tracking -0.032em). Tinggi baris judul berasal dari token; jangan menambah
`leading-[…]` atau `tracking-[…]`.

## Radius

`rounded-md` 6 tag · `rounded-lg` 8 kontrol · `rounded-xl` 12 kontrol besar dan modal · `rounded-2xl` 16 kartu ·
`rounded-panel` 20 panel hero · `rounded-full` pil.

## Tinggi dan jarak

- Kontrol: 32 (`h-8`, kecil) · 40 (`h-10`, standar) · 48 (`h-12`, besar). Lencana 20/24, pil 28.
- Header 64 (`h-16`) di semua area.
- Lebar isi maksimum 1280. Gutter publik 20 / 40 / 80; ruang kerja staf 20 / 24 / 40 (ada sidebar 256).
- Jarak memakai skala Tailwind kelipatan 4.

## Bayangan

`shadow-card` kartu · `shadow-button` tombol utama · `shadow-panel` panel di latar gelap · `shadow-glow` denyut alur.
