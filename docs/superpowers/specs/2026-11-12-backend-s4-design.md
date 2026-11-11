# Desain Backend SKPI (S4)

Tanggal: 12 Nov 2026. Status: arah disetujui pengguna ("gass" atas pilihan A: akun di PostgreSQL). Detail di bawah adalah
keputusan pembangun yang dapat dikoreksi.

## 1. Maksud

Frontend (S5) sudah berjalan di atas klien API tiruan yang meniru aturan chaincode. Backend S4 menggantikan tiruan itu:
menyimpan draft dan akun di PostgreSQL, menandatangani transaksi ledger dengan identitas X.509 pejabat yang login, dan
melayani verifikasi publik. Setelah backend jalan di laptop, aplikasi di-deploy ke AWS EC2 (domain milik pengguna) dan
terhubung ke VM Fabric di laptop lewat WireGuard (spec deploy terpisah).

## 2. Sasaran, bukan sasaran, anti-sasaran

**Sasaran**
- Semua endpoint spec frontend §6 (+ tambahan pejabat dan `/ledger/info`) dengan bentuk persis `frontend/src/api/types.ts`;
  frontend production (`httpClient.ts`) bekerja tanpa diubah.
- Perilaku sama dengan klien mock: skenario `frontend/src/api/mock/mockClient.test.ts` diporting menjadi test layanan backend.
- Transaksi tulis memakai identitas pejabat yang login (`dekan-<fakultas>`, `rektor`); baca publik memakai `app-reader`.
- Ledger adalah sumber kebenaran: draft hanya berubah ke `DISETUJUI` setelah commit terkonfirmasi.
- Kontainer Docker (production parity); semua nilai lingkungan dari `.env`.

**Bukan sasaran**: SSO Unila, Caliper (S6), perubahan chaincode, deploy AWS (fase berikutnya), mode gelap/UI.

**Anti-sasaran** (gagal walau "jalan")
- Draft ditandai disetujui padahal transaksi tidak tercatat di ledger, atau sebaliknya.
- Verifikasi publik menyajikan status dari salinan lama (cache) sehingga SKPI yang sudah dicabut tampil "Terdaftar".
- Kunci privat, path wallet, stack trace, atau isi sertifikat bocor ke log, respons, atau Git.
- Dekan fakultas A dapat bertindak atas NPM fakultas B (backend wajib memeriksa, chaincode memeriksa lagi).

## 3. Batasan

- Node 22, Express 5, TypeScript (dijalankan `tsx` saat dev/test, dikompilasi `tsc` untuk image), `@hyperledger/fabric-gateway` 1.x.
- PostgreSQL 16 di kontainer, volume bernama; migrasi SQL yang dapat di-review (`node-pg-migrate`); query berparameter; akun
  aplikasi bukan superuser.
- Test: mocha + chai + sinon + supertest. Gateway Fabric di-stub di unit test. Uji SQL dan uji jaringan nyata dipisah dan
  dijalankan eksplisit (`npm run test:db`, `npm run test:fabric`).
- Endorsement policy `AND(peer1, peer2)`: backend menghubungi satu gateway peer; peer itu yang meminta endorsement peer lain.

## 4. Pendekatan

| Pendekatan | Untung | Rugi | Keputusan |
|---|---|---|---|
| A. Proyeksi aset di PostgreSQL, diperbarui dari hasil transaksi; detail & verifikasi selalu dibaca ulang dari ledger | Daftar, pencarian nama, aktivitas cepat dan dapat diindeks; LevelDB tanpa rich query | Proyeksi bisa tertinggal bila ada transaksi di luar aplikasi | **Dipilih** |
| B. Selalu baca ledger untuk setiap daftar | Tidak ada salinan | Harus tahu semua NPM; N panggilan per daftar; admin tidak boleh `BacaSKPI` | Ditolak |
| C. Pendengar event blok untuk sinkron proyeksi | Proyeksi lengkap | Komponen jangka panjang tambahan, rumit untuk riset | Ditunda (bisa ditambah tanpa mengubah API) |

Akun login: **tabel PostgreSQL** (dipilih pengguna) — bukan SSO, bukan berkas konfigurasi.

## 5. Arsitektur

```
backend/
  src/
    config.ts          env tervalidasi (zod); gagal start bila ada yang hilang
    app.ts             perakitan Express (dipakai server.ts dan test)
    server.ts          start + graceful shutdown
    domain/            aturan murni: npm/fakultas, validasi data & alasan, predikat, pejabat (port dari frontend)
    db/                pool pg, migrasi SQL, repositori (users, drafts, events, assets, ledger_tx, officials)
    fabric/            gateway: koneksi per identitas, submit/evaluate dengan batas waktu, pemetaan galat, qscc
    services/          auth, drafts, approvals, records, verify, officials, ledger
    http/              routes, middleware sesi, rate limit, error handler
  migrations/          *.sql
  scripts/             user-create.ts (CLI akun), fetch-wallet.sh (salin identitas dari VM-1)
  test/                unit (stub gateway + repo memori), db (Postgres nyata), fabric (jaringan riset)
```

### 5.1 Data (PostgreSQL)

| Tabel | Isi |
|---|---|
| `users` | id, email (unik), nip, nidn (unik bila ada), password_hash (argon2id), name, role, faculty, fabric_identity, active |
| `drafts` | sama dengan tipe `Draft`; status MENUNGGU_DEKAN/DITOLAK_DEKAN/DISETUJUI/DIGANTIKAN/MENUNGGU_KONFIRMASI |
| `events` | peristiwa off-chain (DIAJUKAN, DITOLAK_DEKAN) dan salinan peristiwa ledger yang dikirim aplikasi (txId) |
| `ledger_assets` | proyeksi aset (kolom = aset chaincode + `synced_at`); indeks GIN `pg_trgm` pada nama |
| `ledger_tx` | txId, draft_id/npm, fungsi, status PENDING/COMMITTED/FAILED, galat, waktu |
| `official_periods`, `official_changes` | periode jabatan & log (seed = `INITIAL_OFFICIALS`) |

### 5.2 Alur tulis (persetujuan dekan/rektor)

1. Validasi + otorisasi di backend (fakultas, status draft, nomor SKPI).
2. Tandai draft `MENUNGGU_KONFIRMASI`, catat `ledger_tx` PENDING dengan txId dari proposal.
3. Endorse → submit → tunggu status commit (batas waktu dari env).
4. Commit sukses: perbarui proyeksi dari nilai kembalian chaincode, draft `DISETUJUI`, event ledger, `ledger_tx` COMMITTED.
5. Ditolak chaincode / endorse gagal: draft kembali `MENUNGGU_DEKAN`, `ledger_tx` FAILED, galat dipetakan ke HTTP.
6. Timeout setelah submit: draft tetap `MENUNGGU_KONFIRMASI`, respons 503 "status transaksi belum pasti". Pekerja
   rekonsiliasi (interval) memeriksa status txId lewat gateway dan menyelesaikan langkah 4 atau 5.

### 5.3 Baca

- `GET /records` & `/activity`: proyeksi + draft + events (lingkup peran: fakultas akun; rektor semua).
- `GET /records/:npm`: dekan/rektor membaca ulang `BacaSKPI` + `RiwayatSKPI` dan menyegarkan proyeksi; admin memakai proyeksi
  + events (admin tidak boleh memanggil fungsi baca chaincode).
- `GET /verify/:npm`: selalu `VerifikasiSKPI` dengan `app-reader`, tanpa cache; nama pejabat dari tabel periode.
- `GET /verify?q=`: pencarian nama di proyeksi (`pg_trgm`, `LIMIT 11` → maks 10 + `truncated`).
- `GET /ledger/info`: qscc `GetChainInfo` dengan `app-reader` → `{channel, msp, height, checkedAt}`; 503 bila peer tak terjangkau.

### 5.4 Pemetaan galat

Galat chaincode (pesan Indonesia) dipetakan: "Akses ditolak" → 403; "tidak ditemukan" → 404; "berstatus", "sudah dipakai",
"sudah memiliki", konflik MVCC → 409; pesan validasi lain → 400. gRPC UNAVAILABLE / DEADLINE_EXCEEDED / koneksi gagal →
503 (`UNAVAILABLE`). Respons `{ error: { code, message } }`; rincian teknis hanya di log server (tanpa isi sertifikat/kunci).

### 5.5 Sesi dan keamanan

- Login: email/NIP/NIDN + sandi → JWT HS256 (rahasia dari env) di cookie `httpOnly; Secure; SameSite=Lax`, umur 8 jam.
- Peran dan fakultas dari baris `users`, bukan dari klien. Perbandingan sandi waktu-konstan; pesan galat login seragam.
- Rate limit: `/auth/login` dan `/verify*` per IP (`trust proxy` 1 karena di belakang nginx).
- Wallet: `wallet/<label>/{cert.pem,key.pem}` + `wallet/tls-ca.pem`, di-mount read-only; tidak pernah di-log.

## 6. Keputusan yang diserahkan ke pembangun

Struktur file internal, nama fungsi, pustaka kecil (zod, pino, express-rate-limit, cookie-parser, jsonwebtoken,
@node-rs/argon2), interval rekonsiliasi, dan batas waktu default — asalkan kontrak §5 dan sasaran §2 terpenuhi.
