# Modernisasi UI, Satu Portal Masuk, Status Blockchain, Cetak 1 Halaman — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Login tanpa pilihan peran dengan pengalihan otomatis, indikator status rantai + blok terbaru, lembar cetak verifikasi 1 halaman A4, dan sistem visual yang lebih tegas.

**Architecture:** Kontrak API berubah di `api/types.ts` + `httpClient.ts` + mock; komponen baru `ChainStatus` + hook `useChainStatus` (polling); `VerifyResult` dipecah menjadi layar web dan `VerifyPrint` (hanya tampil saat cetak); token desain di `index.css`.

**Tech Stack:** React 19, Vite 8, Tailwind v4, Vitest + RTL, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, `qrcode`.

**Spec:** `docs/superpowers/specs/2026-11-11-modernisasi-ui-design.md`

## Global Constraints

- Bahasa UI Indonesia; tanpa istilah Inggris di copy kecuali nama teknis (Hyperledger Fabric, X.509, MSP).
- Tidak ada ungu/gradien; satu gaya tombol & kartu; fokus terlihat; `prefers-reduced-motion` dihormati.
- Production tidak memuat kode mock (kondisi `import.meta.env.DEV && VITE_API_MODE === "mock"` tetap ditulis langsung).
- Blok terbaru yang ditampilkan = `height - 1`.
- Interval polling 15 000 ms; jeda saat `document.hidden`.

## Review Focus

- Nama lulusan / gelar pejabat sangat panjang → cetak tetap 1 halaman (uji: PDF headless dari data seed + nama 100 karakter, hitung halaman = 1).
- `/ledger/info` gagal setelah sebelumnya sukses → indikator berubah ke "Terputus", bukan menampilkan blok lama sebagai tersambung (uji di Task 2).
- Login sukses tanpa `?next` untuk tiap peran → tujuan sesuai peran (uji di Task 1).
- `?next` menunjuk halaman yang tidak boleh untuk peran itu → guard rute tetap mengalihkan ke `/ikhtisar` (perilaku lama, tidak diubah).
- Tab tersembunyi lama lalu kembali → status diperiksa ulang segera (uji di Task 2).

---

### Task 1: Satu portal masuk

**Files:** Modify `src/api/types.ts` (`LoginInput` tanpa `role`), `src/api/mock/mockClient.ts` (hapus `ROLE_MISMATCH`), `src/screens/Login.tsx`, `src/test/renderApp.tsx`, `src/api/mock/mockClient.test.ts`; Test `src/screens/Login.test.tsx`.

**Produces:** `LoginInput = { identifier: string; password: string }`; `homeOf(role: Role): string` di `src/app/home.ts` (`admin → "/ikhtisar"`, `dekan|rektor → "/antrean"`).

- [ ] Test: tidak ada `radiogroup` "Peran"; login dekan tanpa `next` → breadcrumb "Antrean pengesahan"; admin → "Ikhtisar"; rektor dengan `?next=/daftar` → "Daftar & riwayat"; mock `login` dengan email dekan apa pun berhasil tanpa `role`.
- [ ] Jalankan → FAIL. Implementasi. Jalankan seluruh suite → PASS.

### Task 2: Status rantai

**Files:** Modify `src/api/types.ts` (`LedgerInfo`), `client.ts`, `httpClient.ts`, `mock/mockClient.ts`, `mock/store.ts` (hitung transaksi); Create `src/app/useChainStatus.ts`, `src/components/ChainStatus.tsx`; Test `src/components/ChainStatus.test.tsx`, `src/api/mock/mockClient.test.ts`.

**Produces:** `LedgerInfo = { channel: string; msp: string; height: number; checkedAt: string }`; `useChainStatus(): { state: "checking" | "online" | "offline"; info: LedgerInfo | null; latestBlock: number | null }`; `<ChainStatus tone?: "light" | "dark" />`; mock `setChainOnline(online: boolean)` (ekspor dari objek klien mock lewat `MockControls`).

- [ ] Test: mock `height` naik 1 setelah `approveDraft`; `ChainStatus` menampilkan "Tersambung" dan "Blok #<height-1>"; setelah `ledgerInfo` menolak 503 dan interval lewat → "Terputus"; `visibilitychange` ke terlihat memicu panggilan baru.
- [ ] FAIL → implementasi (timer palsu Vitest) → PASS. Pasang di `Shell`, `PublicNav`, `Login`.

### Task 3: Lembar cetak verifikasi + layar hasil

**Files:** Create `src/screens/verify/VerifyPrint.tsx`, `src/components/Qr.tsx`; Modify `VerifyResult.tsx`, `index.css` (`@page { size: A4; margin: 12mm }`); Test `Verify.test.tsx`.

- [ ] Test: dokumen cetak (`role="document"`, nama "Hasil Verifikasi SKPI") memuat NPM, nomor SKPI, kedua nama pejabat, "Blok #", nomor referensi pemeriksaan, dan QR (`img` bernama "Kode QR verifikasi"); tombol "Cetak" memanggil `window.print`.
- [ ] FAIL → implementasi → PASS. Verifikasi manual: PDF headless Chrome dari `/verifikasi/2017051008` dan NPM dicabut = 1 halaman.

### Task 4: Sistem visual & copy

**Files:** `index.css`, `main.tsx`, `components/ui/*`, `Shell.tsx`, `PublicNav.tsx`, `PublicVerify.tsx`, `Overview.tsx`, `PageHeader` pemakaian eyebrow.

- [ ] Ganti font & token warna, hapus eyebrow berulang dan angka `01/02/03`, perbarui copy login & portal. Seluruh suite tetap PASS; tangkapan layar 1440 & 390 diperiksa.

### Task 5: Dokumen & verifikasi akhir

- [ ] Perbarui spec 2026-11-10 §5.1/§6, README bila perlu. `npm run typecheck`, `npx vitest --run`, `npm run build` hijau. Commit per task.
