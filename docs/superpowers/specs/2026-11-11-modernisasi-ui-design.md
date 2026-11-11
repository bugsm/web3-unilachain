# Modernisasi UI, satu portal masuk, status blockchain, cetak verifikasi 1 halaman

Tanggal: 11 Nov 2026. Status: disetujui pengguna (pilihan A untuk cetak), detail tampilan = keputusan pembangun.

## 1. Maksud

Frontend sudah fungsional tetapi terlihat seperti templat SaaS generik (eyebrow huruf kapital di setiap judul, daftar bernomor
`01/02/03`, panel gradien gelap, istilah Inggris campur, titik hijau berdenyut yang selalu "tersambung" walau tidak memeriksa apa pun).
Pengguna meminta tampilan yang lebih modern dan "anti-slop" (skill `ui-ux-pro-max` dan `design-taste-frontend` dipasang di
`.claude/skills/`), dengan tiga perubahan wajib:

1. **Satu portal masuk.** `/masuk` tidak lagi meminta pilihan peran. Peran dibaca dari akun; aplikasi mengarahkan sendiri.
2. **Status blockchain** terlihat di web: tersambung atau tidak, dan tinggi blok terbaru.
3. **Hasil verifikasi & cetak** lebih profesional; hasil cetak **selalu muat satu lembar A4**.

## 2. Sasaran / bukan sasaran / anti-sasaran

**Sasaran**
- Login: identitas + sandi saja. Pengalihan: `?next` aman bila ada; selain itu admin → `/ikhtisar`, dekan & rektor → `/antrean`.
- Indikator rantai di header staf, header publik, dan halaman masuk: `Tersambung · Blok #N`, `Terputus`, atau `Memeriksa…`;
  diperbarui tiap 15 detik, dijeda saat tab tersembunyi, langsung diperiksa ulang saat tab kembali terlihat.
- Hasil verifikasi: layar web yang lebih tegas dan **lembar cetak khusus** (kop Unila, judul "Hasil Verifikasi SKPI", status,
  tabel metadata, dua penanda tangan, nomor & waktu pemeriksaan, tinggi blok saat diperiksa, kode QR menuju halaman verifikasi).
- Sistem visual satu: token warna di `index.css`, satu font UI + mono, satu gaya kartu/tombol.

**Bukan sasaran**: backend (belum ada), mode gelap, perubahan alur pengesahan.

**Anti-sasaran**
- Hasil cetak terpotong ke lembar kedua untuk data apa pun yang mungkin (nama 100 karakter, gelar panjang).
- Indikator "tersambung" tanpa benar-benar memanggil `/ledger/info`.
- Menampilkan nomor blok per SKPI (dilarang spec 2026-11-10 §2; tinggi chain dari `qscc GetChainInfo` boleh).
- Pemilih peran tersisa di build production.

## 3. Pendekatan

| Pendekatan | Untung | Rugi | Keputusan |
|---|---|---|---|
| A. Lembar cetak khusus (komponen `print:block`, layar web `print:hidden`) + `@page A4` | Tata letak cetak dikendalikan penuh, pasti 1 halaman | Dua tampilan untuk data yang sama | **Dipilih** |
| B. Gaya `@media print` pada layar web | Satu markup | Tata letak web (grid 12 kolom, kartu gelap) sulit dipaksa 1 halaman | Ditolak |
| C. PDF dibuat di klien (jsPDF) | Berkas unduhan | Dependensi besar, font harus disematkan | Ditolak |

Status rantai: **polling `/ledger/info`** (dipilih) vs SSE/WebSocket blok (backend belum ada; polling cukup untuk indikator).

## 4. Kontrak API (mengubah spec 2026-11-10 §6)

- `POST /auth/login` `{identifier, password}` → `{user}`. **`role` dihapus**; backend menentukan peran dari akun.
- `GET /ledger/info` (publik) → `{channel, msp, height, checkedAt}`; `height` = tinggi chain dari `qscc GetChainInfo`.
  UI menampilkan **blok terbaru = `height - 1`** (blok genesis bernomor 0). Peer tidak terjangkau → 503.

## 5. Keputusan pembangun (dapat dikoreksi)

- Revisi 2 (umpan balik pengguna: versi pertama masih terasa template). Palet dan font **dibagikan taste-skill**
  (`start.mjs deal --page software --trade fintech`): palet `warm-black-gold` (dipilih alih-alih `lunar-grey-bronze`
  karena emas cocok dengan logo Unila), font **Instrument Sans + DM Mono** (self-host `@fontsource`).
- Tinta hitam hangat `#0c0a08` untuk teks dan tombol utama; skala slate Tailwind ditimpa netral hangat; emas `#c9a45a`
  hanya aksen di latar gelap. Halaman masuk dan hero portal memakai latar gelap `ground-ledger` (kisi halus + cahaya emas).
- Visual produk = diagram alur pengesahan nyata (Admin → Dekan → Rektor → Ledger) dengan nomor blok langsung; denyut emas
  3,2 s × 3 lalu diam, diulang saat pointer masuk. Hero masuk sekali saat dimuat (700 ms). Tidak ada data karangan.
- QR: paket `qrcode` (SVG, tanpa kanvas).
- Hapus eyebrow huruf kapital berulang, angka `01/02/03`, panel "seal" berbahasa Inggris di login.
- Mock: `height` = 1.200 + jumlah transaksi ledger di store; `setChainOnline(false)` untuk demo/test terputus.
