# Desain Frontend SKPI (S5)

Tanggal: 10 Nov 2026. Status: disetujui arah (pilihan A), detail di bawah adalah keputusan pembangun yang dapat dikoreksi.

## 1. Maksud

Mengisi `frontend/` dengan antarmuka yang **meniru tampilan** rancangan Figma Make di
`../Rancang Antarmuka Verifikasi SKPI/` (7 layar: Login, Ikhtisar, Catat SKPI, Antrean pengesahan,
Daftar & riwayat, Portal verifikasi, Hasil verifikasi), tetapi **alur, peran, status, dan aturan data mengikuti**
`README.md` repo ini dan `../onchain/docs/desain-alur-pengesahan.md` (chaincode). Animasi dan detail interaksi
dipoles mengikuti prinsip skill Emil Kowalski (`emil-design-eng`, `animate`, `mobile-native`, `ask-sonner`).

## 2. Sasaran, bukan sasaran, anti-sasaran

**Sasaran**
- Visual setara rancangan: tipografi Plus Jakarta Sans + JetBrains Mono, palet slate/biru `#1D4ED8`, tata letak grid, komponen `ui.tsx`.
- Alur sesuai chaincode: admin fakultas membuat draft (pencatatan/perubahan/pencabutan), dekan menyetujui = transaksi, rektor hanya pada pencatatan pertama.
- Frontend dapat dijalankan dan diuji **sebelum backend ada**, lewat klien API tiruan yang meniru aturan chaincode.
- Kontrak HTTP ke backend tertulis (§6) sehingga sprint S4 tinggal mengikuti.

**Bukan sasaran**: backend, autentikasi nyata, compose aplikasi, Caliper.

**Anti-sasaran** (gagal walau "jalan"):
- UI menampilkan data yang tidak bisa diberikan ledger/backend (mis. alasan pencabutan di portal publik, nomor blok dari `getHistoryForKey`).
- Peran demo yang bisa berganti tanpa login di build production.
- Aturan validasi frontend berbeda dengan chaincode (predikat, `skpiId`, digit ke-4 NPM, `totalSKP ≥ 25`).

## 3. Batasan

- React 19 + Vite + TypeScript + Tailwind v4 + lucide-react (sama dengan rancangan). npm, Node 22.
- Uji: Vitest + React Testing Library + jsdom, TDD (CLAUDE.md §3).
- Production parity: image Docker yang sama untuk laptop riset dan production; tidak ada nilai lingkungan yang di-build ke bundle. API selalu di path relatif `/api`, diproksikan nginx.
- Bahasa UI Indonesia.

## 4. Pendekatan yang dipertimbangkan

| Pendekatan | Untung | Rugi | Keputusan |
|---|---|---|---|
| A. Tampilan Figma, alur README/chaincode | Langsung cocok dengan backend & chaincode | Beberapa layar perlu diubah dari rancangan | **Dipilih pengguna** |
| B. Salin Figma apa adanya | Cepat | Harus dibongkar saat backend dibangun; menyesatkan untuk uji Caliper/blackbox | Ditolak |

## 5. Pemetaan rancangan → sistem

### 5.1 Peran
| Figma | Sistem | Lingkup |
|---|---|---|
| `jurusan` (Admin Jurusan) | **Admin fakultas** | satu fakultas; tanpa identitas Fabric |
| `dekan` | Dekan `dekan-<kode>` | fakultasnya |
| `rektor` | Rektor | semua fakultas |
| (publik) | Verifikator | tanpa login |

Kontrol "Peran demo" di sidebar **dihapus**. Sejak 11 Nov 2026 Login adalah **satu portal tanpa pilihan peran**: backend menentukan peran dari akun, frontend mengarahkan admin ke Ikhtisar dan dekan/rektor ke Antrean (spec `2026-11-11-modernisasi-ui-design.md`).

### 5.2 Status yang tampil di UI
| Status UI | Lokasi | Asal |
|---|---|---|
| `MENUNGGU_DEKAN` | off-chain | draft pencatatan diajukan |
| `DITOLAK_DEKAN` | off-chain | dekan menolak draft (alasan wajib) |
| `MENUNGGU_REKTOR` | ledger | `SahkanDekan` |
| `AKTIF` | ledger | `SahkanRektor` / `PerbaruiSKPI` |
| `DITOLAK_REKTOR` | ledger | `TolakRektor` |
| `DICABUT` | ledger | `CabutSKPI` |

SKPI `AKTIF` dapat memiliki **draft tertunda** berjenis `PERUBAHAN` atau `PENCABUTAN` (status draft `MENUNGGU_DEKAN`/`DITOLAK_DEKAN`); ditampilkan sebagai penanda tambahan di samping badge status.

### 5.3 Data aset
Field input admin: `npm`, `name`, `skpiId`, `programStudy`, `totalSKP`. Tidak ada input `issuer` dan `issuedTimestamp`
(diisi chaincode dari sertifikat dekan dan waktu transaksi `SahkanDekan`). Fakultas mengikuti akun admin.

Validasi di frontend (cermin chaincode, pesan berbahasa Indonesia):
- `npm`: 10 digit; digit ke-4 = fakultas admin (1 FEB, 2 FH, 3 FKIP, 4 FP, 5 FT, 6 FISIP, 7 FMIPA, 8 FK).
- `name`: 1–100 karakter setelah trim, tanpa karakter kontrol.
- `skpiId`: `^\d{3,}/UN26\.\d{1,2}/SKPI/\d{4}$`, maks 64, kode unit = kode unit fakultas (FEB 11 … FK 18, `pengesah.conf`).
- `programStudy`: dari daftar prodi fakultas (data contoh rancangan), maks 100.
- `totalSKP`: bilangan bulat ≥ 25.
- Predikat: >225 Unggul, 151–225 Sangat Baik, 76–150 Baik, 25–75 Cukup.
- Alasan tolak/cabut: wajib, maks 500 karakter (UI meminta min 10 karakter agar bermakna).

### 5.4 Layar
- **Login**: tata letak dua kolom rancangan. Identitas email/NIP/NIDN + sandi + peran. Panel "Seals": "Multi-signature" disesuaikan menjadi "Dekan dan Rektor menandatangani … (2 tanda tangan)"; admin tidak menandatangani.
- **Ikhtisar**: pipeline Menunggu Dekan → Menunggu Rektor → Aktif; sisi: Dicabut, Ditolak (dekan+rektor). Admin: tabel "Ditolak · perlu perbaikan"; dekan/rektor: "Menunggu tanda tangan Anda". Umpan "Aktivitas" berisi transaksi ledger (txId, waktu) dan peristiwa off-chain (diberi label off-chain, tanpa hash). Tanpa nomor blok.
- **Catat SKPI** (admin): mode Satuan & Batch (CSV/tempel) dipertahankan, kolom CSV `npm,name,skpiId,programStudy,totalSKP`. Tombol "Ajukan ke Dekan". Layar bukti: "Draft tersimpan, belum masuk ledger" + rantai pengesahan, tanpa txId.
- **Antrean pengesahan**:
  - Dekan: draft fakultasnya, kolom **Jenis** (Pencatatan/Perubahan/Pencabutan). Tinjau: pencatatan = metadata; perubahan = tabel *sebelum → sesudah* terhadap ledger; pencabutan = alasan. Setujui = tx (`SahkanDekan`/`PerbaruiSKPI`/`CabutSKPI`), Tolak = off-chain, alasan wajib. Sahkan massal: satu tx per draft, hasil per baris (berhasil/gagal) ditampilkan.
  - Rektor: SKPI `MENUNGGU_REKTOR` semua fakultas; Sahkan = `SahkanRektor`, Tolak = `TolakRektor` (alasan tercatat di ledger).
- **Daftar & riwayat**: tab Semua / Dalam pengesahan / Aktif / Dicabut / Ditolak. Drawer detail: metadata, rantai pengesahan, riwayat (`RiwayatSKPI`: txId, waktu, penanda tangan, ringkasan perubahan antar versi) ditambah peristiwa draft off-chain. Aksi admin: *Perbaiki & ajukan ulang* (DITOLAK_DEKAN), *Ajukan perubahan* & *Ajukan pencabutan* (AKTIF, bila belum ada draft tertunda), *Catat ulang* (DICABUT/DITOLAK_REKTOR → draft pencatatan baru). Dekan/rektor: baca saja.
- **Portal verifikasi**: satu isian "NPM atau nama lulusan" (10 digit → NPM, selain itu nama, min 3 karakter). Nama → daftar kandidat (maks 10) berisi nama, NPM lengkap (NPM memang bagian metadata publik `VerifikasiSKPI`), program studi, dan fakultas; nama sama untuk lebih dari satu lulusan dibedakan oleh NPM dan prodi. Teks "Cara membaca hasil" diperbarui untuk 4 hasil.
- **Hasil verifikasi**: 4 hasil `TERDAFTAR` / `DICABUT` / `BELUM_SAH` / `TIDAK_TERDAFTAR`. Tabel metadata publik (tanpa kolom "Masukan"/cocok karena tidak ada input pembanding selain kunci pencarian). Penanda tangan: issuer dekan + waktu terbit; rektor = nama dari tabel periode jabatan + `rektorTimestamp`. Tidak ada alasan pencabutan dan txId. Tombol cetak dipertahankan.

## 6. Kontrak API (untuk backend S4)

Semua di bawah `/api`, JSON, sesi lewat cookie httpOnly. Galat: `{ "error": { "code": string, "message": string } }`
dengan status 400/401/403/404/409/429/502/503 sesuai CLAUDE.md.

| Metode & path | Peran | Isi |
|---|---|---|
| `POST /auth/login` `{identifier,password}` | publik | `→ {user}` (peran dari akun, bukan dari klien) |
| `GET /auth/me` / `POST /auth/logout` | login | `→ {user}` / 204 |
| `GET /records?status&q` | semua staf | `→ SkpiRecord[]` (draft+aset dalam lingkup peran) |
| `GET /records/:npm` | staf | `→ RecordDetail` (detail + `history[]` ledger dan off-chain) |
| `GET /queue` | dekan, rektor | `→ QueueItem[]` (draft fakultas / `MENUNGGU_REKTOR`) |
| `GET /activity?limit=` | staf | `→ ActivityItem[]` |
| `POST /drafts` `{type,npm,name?,skpiId?,programStudy?,totalSKP?,reason?}` (datar) | admin | `→ {draft}` |
| `POST /drafts/batch` `{items[]}` | admin | `→ {created[], errors[]}` |
| `PUT /drafts/:id` `{name,skpiId,programStudy,totalSKP}` | admin (DITOLAK_DEKAN) | ubah & ajukan ulang `→ {draft}` |
| `POST /drafts/:id/approve` | dekan | `→ {txId}` |
| `POST /drafts/:id/reject` `{reason}` | dekan | `→ {draft}` |
| `POST /records/:npm/rektor/approve` | rektor | `→ {txId}` |
| `POST /records/:npm/rektor/reject` `{reason}` | rektor | `→ {txId}` |
| `GET /verify?q=` | publik, rate limit | `→ {candidates[], truncated}` (maks 10; `truncated` = ada lebih dari 10 kecocokan) |
| `GET /verify/:npm` | publik, rate limit | `→ VerifyResult {status, data, rektorName}` |
| `GET /ledger/info` | publik | `→ {channel, msp, height, checkedAt}`; `height` dari `qscc GetChainInfo`, 503 bila peer tidak terjangkau |

Bentuk tipe TypeScript-nya ditetapkan di `frontend/src/api/types.ts` dan menjadi acuan backend; `frontend/src/api/httpClient.ts`
membuka pembungkus `{user}`/`{draft}` dan meratakan `data` draft ke body. Alasan (`reason`) dikirim sebagai satu baris karena
chaincode menolak karakter kontrol. Draft `DITOLAK_DEKAN` yang digantikan draft baru untuk NPM yang sama berstatus `DIGANTIKAN`
dan tidak lagi menentukan status rekaman maupun memesan nomor SKPI.

## 7. Arsitektur frontend

```
frontend/
  src/
    api/        types.ts, client.ts (antarmuka), http.ts (fetch /api), mock/ (in-memory + seed, aturan chaincode)
    domain/     aturan murni: fakultas, predikat, validasi, status, rantai pengesahan, format waktu
    components/ ui (Button, Badge, Field, Modal, Drawer, Hash, …), Shell, PublicNav
    screens/    Login, Overview, Record, Approvals, Registry, PublicVerify, VerifyResult
    app/        router (react-router), sesi (context), Toaster
  Dockerfile, nginx/default.conf.template
```
- Pemilihan klien: `import.meta.env.VITE_API_MODE === 'mock'` saat dev/test; build production selalu `http`.
- Routing: `/masuk`, `/ikhtisar`, `/catat`, `/antrean`, `/daftar`, `/daftar/:npm`, `/verifikasi`, `/verifikasi/:npm`, dengan guard peran.
- Toast: **Sonner** (pengganti `Toast` buatan rancangan).
- Font di-self-host lewat `@fontsource` agar tidak bergantung pada Google Fonts saat production.

## 8. Gerak & detail (Emil Kowalski)

- Token easing: `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-drawer: cubic-bezier(0.32,0.72,0,1)`.
- Tombol & elemen yang dapat ditekan: `active:scale-[0.97]`, transisi `transform 160ms` (bukan `transition-all`).
- Modal: masuk `opacity 0 + scale(0.96) → 1` 200ms ease-out, keluar 150ms; origin tengah; tetap ter-mount selama animasi keluar.
- Drawer: `translateX(100%) → 0` 300ms `--ease-drawer`, keluar 200ms; backdrop opacity.
- Pergantian layar staf (sering): hanya opacity 120ms, tanpa geser. Tabel, angka pipeline, tab: tanpa animasi.
- Hasil verifikasi (jarang, publik): ikon status masuk `scale(0.9)+opacity`, bagian berikutnya stagger 40ms.
- Tombol loading: label berganti dengan crossfade + blur 2px. Ikon salin hash: crossfade ikon.
- Bilah aksi massal: muncul dengan transisi (bukan keyframe) agar dapat diinterupsi.
- `prefers-reduced-motion`: transform dihapus, opacity dipertahankan.
- Mobile: `100dvh`, input 16px di layar kecil (cegah zoom), `-webkit-tap-highlight-color: transparent`, safe-area inset pada header/sidebar.

## 9. Diserahkan ke pembangun

- Isi data contoh (seed) mock: cakup semua status di §5.2 untuk minimal 2 fakultas.
- Pembagian file komponen, nama hook, dan detail kelas Tailwind selama visual setara rancangan.
- Ambang responsif tabel (scroll horizontal seperti rancangan).
