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

## Cara menjalankan (rencana)

Backend dan frontend dijalankan sebagai **kontainer Docker** agar image yang sama dipakai di laptop riset
dan di server production. Semua nilai yang berbeda antar-lingkungan (domain Fabric, alamat peer, port,
rahasia JWT) dibaca dari `.env`. Untuk development tetap bisa `npm run dev`.

Prasyarat di server aplikasi (laptop riset: Windows + Docker Desktop):

1. Bisa menjangkau `peer1.<DOMAIN>:7051`. Untuk riset, isi `C:\Windows\System32\drivers\etc\hosts` dengan blok
   dari `hosts_block` di unila-chain (`network/scripts/env.sh`). Kontainer Docker tidak membaca file hosts
   Windows, jadi compose aplikasi juga memakai `extra_hosts`.
2. Folder `wallet/` berisi CA TLS UnilaMSP, sertifikat + kunci akun dekan (8 fakultas), rektor, dan `app-reader` yang disalin dari VM-1.
   Folder ini tidak masuk Git.

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
