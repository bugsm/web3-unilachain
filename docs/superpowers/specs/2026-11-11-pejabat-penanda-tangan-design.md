# Desain: Nama Pejabat Penanda Tangan (Rektor & Dekan)

Tanggal: 11 Nov 2026. Melengkapi `2026-11-10-frontend-skpi-design.md`. Pendekatan A dipilih pengguna.

## 1. Maksud

Nama rektor dan dekan yang tampil pada hasil verifikasi dapat dikelola lewat UI oleh admin fakultas, tanpa mengubah kode,
dan **SKPI lama tetap menampilkan pejabat yang menandatanganinya** (keputusan no. 10 `desain-alur-pengesahan.md`).
Setiap perubahan tercatat: admin mana, kapan, sebelum → sesudah.

## 2. Aturan

| Hal | Aturan |
|---|---|
| Jabatan | `REKTOR` dan satu jabatan dekan per fakultas (`FEB` … `FK`) |
| Data | Periode: nama + tanggal mulai + tanggal selesai (kosong = masih menjabat) |
| Siapa mengubah | Rektor: admin fakultas **mana pun**. Dekan: hanya admin fakultas **itu sendiri** |
| Dekan & rektor (akun) | Hanya melihat |
| Koreksi | Mengganti nama pada satu periode (salah ketik/gelar). Tanggal tidak berubah |
| Pergantian | Menutup periode berjalan sehari sebelum tanggal mulai baru, lalu membuka periode baru. Tanggal mulai baru harus setelah mulai periode berjalan dan tidak di masa depan |
| Pencatatan | Setiap koreksi/pergantian menyimpan `{jenis, jabatan, sebelum, sesudah, oleh, waktu}`. UI menampilkan "terakhir diubah oleh … · waktu" per jabatan dan riwayat lengkapnya |
| Validasi nama | 3–150 karakter setelah trim, tanpa karakter kontrol |
| Pemilihan nama | Rektor dipilih dari `rektorTimestamp`, dekan dari `issuedTimestamp` (waktu `SahkanDekan`) dan fakultas SKPI. Tanpa periode yang cocok → nama tidak ditampilkan, hanya jabatan |

Bukan sasaran: menyimpan nama ke ledger (ledger hanya menjamin akun penanda tangan dan waktunya); hapus periode.

## 3. Data awal (dari pengguna)

Rektor: Prof. Dr. Ir. Lusmeilia Afriani, D.E.A., IPM., ASEAN Eng.
Dekan: FEB Prof. Dr. Nairobi, S.E., M.Si. · FH Dr. Muhammad Fakih, S.H., M.S. · FKIP Dr. Albet Maydiantoro, S.Pd., M.Pd. ·
FP Dr. Ir. Kuswanta Futas Hidayat, M.P. · FT Dr. Hi. Ahmad Herison, S.T., M.T. · FISIP Prof. Dr. Anna Gustina Zainal, S.Sos., M.Si. ·
FMIPA Dr. Eng. Heri Satria, S.Si., M.Si. · FK Dr. dr. Evi Kurniawaty, M.Sc.

Tanggal mulai belum diketahui; data mock memakai **2023-01-01 sebagai contoh** (keputusan pembangun). Backend production mengisi tanggal resmi.

## 4. Kontrak API (tambahan §6)

| Metode & path | Peran | Isi |
|---|---|---|
| `GET /officials` | staf | `→ Official[]` — per jabatan: `{office, periods[], lastChange}` |
| `GET /officials/changes?office=` | staf | `→ OfficialChange[]` terbaru dulu |
| `POST /officials/:office/corrections` `{periodId, name}` | admin (aturan §2) | `→ Official` |
| `POST /officials/:office/successions` `{name, from}` | admin (aturan §2) | `→ Official` |
| `GET /verify/:npm` | publik | ditambah `dekanName` di samping `rektorName` |

Galat: 400 validasi, 403 jabatan di luar wewenang, 409 tanggal pergantian tidak sah.

## 5. Layar

- Menu staf baru **"Pejabat"** (`/pejabat`), untuk semua staf. Kartu Rektor di atas, lalu tabel 8 dekan.
  Setiap jabatan: nama berjalan, menjabat sejak, "terakhir diubah oleh admin.feb · 11 Nov 2026 14.10 WIB", tombol
  *Koreksi nama* dan *Catat pergantian* (hanya bila berwenang), dan riwayat periode + perubahan di drawer.
- Hasil verifikasi publik: "Tahap 1 · Dekan" menampilkan nama dekan + "Dekan Fakultas …"; "Tahap 2 · Rektor" sudah memakai `rektorName`.
- Gerak mengikuti spec induk §8 (modal/drawer yang sudah ada; tanpa animasi pada tabel).

## 6. Pendekatan

| Pendekatan | Keputusan |
|---|---|
| A. Periode + koreksi/pergantian + log | **Dipilih** — SKPI lama tetap benar, sesuai keputusan no. 10 |
| B. Satu nama ditimpa | Ditolak — mengubah nama pada SKPI yang sudah terbit |
