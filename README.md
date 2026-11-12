# skpi-app

Aplikasi off-chain untuk sistem SKPI Unila: backend Express, frontend React, dan pengujian kinerja Caliper.
Ini bagian **off-chain**. Jaringan Fabric (peer, orderer, CA) dan chaincode adalah bagian **on-chain**
di repo terpisah, **unila-chain** (folder `onchain/` di sebelah folder ini).

```
backend/      Express 5 + @hyperledger/fabric-gateway (Sprint S4)
frontend/     React 19 + Vite (Sprint S5)
caliper/      Hyperledger Caliper 0.7.1: networks/, benchmarks/, workload/ (Sprint S6)
scripts/      skrip bantu, mis. mengambil sertifikat dari VM-1 ke wallet/
results/      blackbox.md, caliper/run-1..3/
```

## Cara menjalankan

Backend dan frontend dijalankan sebagai **kontainer Docker** agar image yang sama dipakai di laptop riset
dan di server production. Semua nilai yang berbeda antar-lingkungan (domain Fabric, alamat peer, port,
rahasia JWT) dibaca dari `.env`. Untuk development tetap bisa `npm run dev`.

Prasyarat di server aplikasi (laptop riset: Windows + Docker Desktop):

1. Bisa menjangkau `peer1.<DOMAIN>:7051`. Untuk riset, isi `C:\Windows\System32\drivers\etc\hosts` dengan blok
   dari `hosts_block` di unila-chain (`network/scripts/env.sh`). Kontainer Docker tidak membaca file hosts
   Windows, jadi compose aplikasi juga memakai `extra_hosts`.
2. Folder `wallet/` berisi CA TLS UnilaMSP, sertifikat + kunci akun dekan (8 fakultas), rektor, dan `app-reader` yang disalin dari VM-1.
   Folder ini tidak masuk Git.

```bash
cp .env.example .env                          # isi sandi DB, JWT_SECRET, FABRIC_DOMAIN, PEER1_IP, PEER2_IP
scripts/fetch-wallet.sh skpi@192.168.56.11    # salin identitas dari VM-1 ke wallet/ (via scp)
docker compose up -d --build                  # postgres + backend + frontend; migrasi jalan otomatis
docker compose exec backend node dist/scripts/user-create.js   --email dekan.fmipa@unila.ac.id --name "Dekan FMIPA" --role dekan --faculty FMIPA   # sandi diminta lewat stdin
```

Aplikasi di `http://127.0.0.1:8080` (`HTTP_BIND`/`HTTP_PORT`). Untuk production, letakkan reverse proxy HTTPS di depannya
dan biarkan `COOKIE_SECURE=true`. Peran akun: `admin` (wajib `--faculty`), `dekan` (wajib `--faculty`), `rektor`; identitas
Fabric diturunkan otomatis (`dekan-<fakultas>`, `rektor`).

## Backend

Express 5 + `@hyperledger/fabric-gateway` + PostgreSQL 16, TypeScript. Desain: `docs/superpowers/specs/2026-11-12-backend-s4-design.md`.

```bash
cd backend
npm ci
docker compose -f docker-compose.test.yml up -d   # Postgres khusus test (port 55432)
npm test                # unit + uji kontrak (klien HTTP frontend asli vs backend, ledger tiruan)
npm run test:db         # repositori SQL
npm run test:fabric     # asap ke jaringan riset nyata (VM menyala, variabel FABRIC_* terisi), hanya baca
```

- Ledger sumber kebenaran: draft baru `DISETUJUI` setelah transaksi ter-commit. Bila status commit belum pasti, draft dikunci
  dan rekonsiliasi (tiap `RECONCILE_INTERVAL_MS`) memastikannya lewat ledger.
- Verifikasi publik selalu dibaca dari ledger (`VerifikasiSKPI`, identitas `app-reader`), tidak pernah dari salinan.
- Daftar dan pencarian nama memakai proyeksi aset di PostgreSQL yang diperbarui dari hasil transaksi.

## Frontend

React 19 + Vite + Tailwind v4. Tampilan mengikuti rancangan Figma "Rancang Antarmuka Verifikasi SKPI", alur mengikuti
chaincode (spesifikasi: `docs/superpowers/specs/2026-11-10-frontend-skpi-design.md`, kontrak API di §6).

```bash
cd frontend
cp .env.example .env.local   # VITE_API_MODE=mock: klien API tiruan, tanpa backend
npm ci
npm run dev                  # http://localhost:5173, akun demo tampil di halaman masuk (mode mock)
                             # mode mock: skpiChain(false) di konsol browser mensimulasikan peer terputus
npm test -- --run            # Vitest + React Testing Library
npm run build                # tsc + vite build; mode mock tidak pernah masuk bundle production
```

Tanpa `VITE_API_MODE=mock`, `npm run dev` meneruskan `/api` ke `http://localhost:3000` (backend).

Image Docker (nginx, port 8080) meneruskan `/api/` ke `BACKEND_URL` yang dibaca saat kontainer start:

```bash
docker build -t skpi-frontend frontend
docker run --rm -p 8080:8080 -e BACKEND_URL=http://host.docker.internal:3000 skpi-frontend
```

## Kesesuaian dengan unila-chain

| Hal | Nilai | Sumber di unila-chain |
|---|---|---|
| Channel | `skpi-channel` | `network/scripts/env.sh` |
| Chaincode | `skpi` | `network/scripts/deploy-cc.sh` |
| MSP ID | `UnilaMSP` | `network/configtx/configtx.template.yaml` |
| Akun pengesah (X.509) | `dekan-feb`, `dekan-fh`, `dekan-fp`, `dekan-fkip`, `dekan-ft`, `dekan-fisip`, `dekan-fmipa`, `dekan-fk`, `rektor` | `network/pengesah.conf` |
| Fungsi chaincode | `SahkanDekan`, `SahkanRektor`, `TolakRektor`, `PerbaruiSKPI`, `CabutSKPI`, `VerifikasiSKPI`, `BacaSKPI`, `RiwayatSKPI` | `docs/desain-alur-pengesahan.md` |

Perubahan nama fungsi atau parameter chaincode harus diikuti perubahan di backend dan workload Caliper repo ini.

## Alur pengesahan (sisi aplikasi)

Rincian lengkap ada di `docs/desain-alur-pengesahan.md` repo unila-chain. Yang menjadi tanggung jawab aplikasi ini:

- **Admin fakultas** (akun aplikasi, tanpa identitas Fabric) membuat draft pencatatan, perubahan, atau pencabutan
  untuk mahasiswa fakultasnya. Draft disimpan di **database off-chain** dan belum masuk blockchain.
- **Dekan** melihat antrean draft fakultasnya. *Tolak* hanya mengubah status draft di database; *Setujui*
  mengirim transaksi (`SahkanDekan` / `PerbaruiSKPI` / `CabutSKPI`) dengan identitas X.509 dekan tersebut.
- **Rektor** melihat SKPI berstatus `MENUNGGU_REKTOR` dan mengirim `SahkanRektor` atau `TolakRektor`.
- **Verifikator** (tanpa login) mencari dengan NPM **atau** nama. Pencarian nama memakai database off-chain untuk mendapatkan NPM,
  lalu status diambil dari ledger lewat `VerifikasiSKPI(npm)` dengan identitas `app-reader`. Endpoint ini wajib dibatasi laju
  permintaan dan jumlah hasilnya, dan nama yang sama dapat menghasilkan lebih dari satu lulusan.
- **Nama rektor** disimpan di tabel periode jabatan (nama, tanggal mulai, tanggal selesai). Saat verifikasi, nama dipilih berdasarkan
  `rektorTimestamp` dari hasil `VerifikasiSKPI`.
