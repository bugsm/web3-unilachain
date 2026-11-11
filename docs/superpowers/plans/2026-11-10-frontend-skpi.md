# Frontend SKPI (S5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun `offchain/frontend/` yang meniru tampilan rancangan Figma Make, dengan alur admin fakultas → dekan → rektor sesuai chaincode, berjalan di atas klien API tiruan sampai backend S4 siap.

**Architecture:** Aturan domain murni (`src/domain`) dipakai bersama oleh klien API tiruan (`src/api/mock`) dan layar. Layar hanya bicara lewat antarmuka `ApiClient` (`src/api/client.ts`), dengan implementasi `mock` (dev/test) dan `http` (production, `fetch('/api/...')`). Visual diporting dari `../Rancang Antarmuka Verifikasi SKPI/src` lalu diubah sesuai spec §5.

**Tech Stack:** React 19, Vite, TypeScript 5, Tailwind CSS v4 (`@tailwindcss/vite`), lucide-react, react-router 7, sonner 2, @fontsource (Plus Jakarta Sans, JetBrains Mono), Vitest + @testing-library/react + user-event + jest-dom + jsdom, nginx (Docker).

**Spec:** `offchain/docs/superpowers/specs/2026-11-10-frontend-skpi-design.md`

**Rujukan visual:** `../Rancang Antarmuka Verifikasi SKPI/src/` (disingkat `RANCANG/`). Setiap task layar mengambil markup dan kelas Tailwind dari file rancangan yang disebut, lalu mengubah hanya yang disebut di task.

## Global Constraints

- Semua path di plan relatif ke `offchain/`. Perintah npm dijalankan di `offchain/frontend/`.
- Node 22, npm (bukan pnpm). Tidak ada nilai lingkungan di bundle production; API selalu `/api` relatif.
- `VITE_API_MODE=mock` hanya untuk `npm run dev`/test; build production memakai klien `http`.
- Teks UI Bahasa Indonesia. Pesan commit Bahasa Indonesia, kalimat biasa (gaya `git log` repo: "Verifikasi publik dengan NPM atau nama").
- Kerja di branch `feat/frontend-s5`. `CLAUDE.md` tidak pernah di-commit.
- Aturan chaincode yang dicerminkan (nilai persis):
  - NPM `^\d{10}$`; digit ke-4 → fakultas: `1 FEB, 2 FH, 3 FKIP, 4 FP, 5 FT, 6 FISIP, 7 FMIPA, 8 FK`.
  - `skpiId` `^\d{3,}\/(UN26\.\d{1,2})\/SKPI\/\d{4}$`, maks 64; kode unit: `FEB UN26.11, FH UN26.12, FKIP UN26.13, FP UN26.14, FT UN26.15, FISIP UN26.16, FMIPA UN26.17, FK UN26.18`.
  - `name`, `programStudy`: 1–100 karakter setelah trim, tanpa karakter kontrol `[\u0000-\u001f\u007f]`.
  - `totalSKP` bilangan bulat `≥ 25`. Predikat: `>225 Unggul`, `151–225 Sangat Baik`, `76–150 Baik`, `25–75 Cukup`.
  - Alasan (tolak/cabut): wajib, `≤ 500` karakter; UI mensyaratkan `≥ 10`.
  - `VerifikasiSKPI` hanya mengembalikan `npm, name, skpiId, programStudy, totalSKP, predicate, issuer, issuedTimestamp, rektorTimestamp, status` — UI publik tidak boleh menampilkan alasan pencabutan, txId, atau nomor blok.
- Gerak (spec §8): `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-drawer: cubic-bezier(0.32,0.72,0,1)`; tidak ada `transition-all`; tidak ada animasi pada tabel, angka, tab, dan aksi keyboard.

## Review Focus

1. **Klik ganda pada "Sahkan"/"Ajukan"** — hanya satu panggilan API; tombol nonaktif selama permintaan berjalan (Task 10, Task 9).
2. **Portal publik kena 429 atau 502/503** — pesan ramah ("Terlalu banyak permintaan, coba lagi dalam beberapa saat" / "Layanan ledger sedang tidak terjangkau"), formulir tetap bisa dipakai (Task 12).
3. **CSV dari Excel berlokal Indonesia** — pemisah `;` dan BOM UTF-8 di awal file tetap terbaca (Task 9).
4. **NPM ditempel dengan spasi** (mis. `"2317 051 001 "`) — di-trim/dibuang spasinya sebelum validasi di Catat dan Verifikasi (Task 2, Task 12).
5. **Nama sama untuk >10 lulusan** — daftar kandidat menampilkan 10 dan pemberitahuan "Hasil dibatasi 10, perjelas nama atau gunakan NPM" (Task 3, Task 12).

---

### Task 1: Kerangka proyek, token desain, dan smoke test

**Files:**
- Create: `frontend/package.json`, `frontend/index.html`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/src/main.tsx`, `frontend/src/index.css`, `frontend/src/test/setup.ts`, `frontend/src/vite-env.d.ts`, `frontend/public/logo-unila.png` (salin dari `RANCANG/../public/logo-unila.png`), `frontend/public/favicon.svg` (salin)
- Create: `frontend/src/App.tsx` (sementara: render `<h1>SKPI Ledger</h1>`)
- Delete: `frontend/.gitkeep`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: skrip `npm run dev | build | test | typecheck`; alias `@` → `src`; kelas utilitas `.ease-out-ui`, token CSS `--ease-out`, `--ease-drawer`; tema `--font-sans`, `--font-mono`.

- [ ] **Step 1:** `git checkout -b feat/frontend-s5`. Buat `package.json` (`"type":"module"`, private) dengan dependensi dari Tech Stack; skrip: `dev: vite`, `build: tsc -b && vite build`, `test: vitest`, `typecheck: tsc -b --noEmit`. Pilih versi `vitest` yang `peerDependencies`-nya cocok dengan versi `vite` terpasang (`npm view vitest peerDependencies`). `npm install`.
- [ ] **Step 2:** `vite.config.ts`: plugin react + tailwind, alias `@`, `test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', globals: true }`, `server.proxy['/api'] = 'http://localhost:3000'`. `setup.ts` mengimpor `@testing-library/jest-dom/vitest`.
- [ ] **Step 3: Tulis test gagal** `App.test.tsx`: `render(<App />)` lalu `expect(screen.getByRole('heading', { name: 'SKPI Ledger' })).toBeInTheDocument()`.
- [ ] **Step 4:** `npx vitest run src/App.test.tsx` → FAIL (App belum ada).
- [ ] **Step 5:** Buat `App.tsx`, `main.tsx`, `index.html` (lang `id`, judul "SKPI Ledger · Universitas Lampung"). `index.css` = isi `RANCANG/index.css` dengan perubahan: ganti `@import url(fonts.googleapis…)` dengan impor `@fontsource/plus-jakarta-sans/{400,500,600,700}.css` dan `@fontsource/jetbrains-mono/{400,500}.css` di `main.tsx`; hapus keyframes `fade-in/slide-in/slide-up/pop-in` dan utilitasnya; tambah di `:root` `--ease-out` dan `--ease-drawer`; di `@layer base`: `html { -webkit-tap-highlight-color: transparent }`, `body { min-height: 100dvh }`, dan `@media (max-width: 640px) { input, select, textarea { font-size: 16px } }`; blok `prefers-reduced-motion` diganti: `*, *::before, *::after { transition-property: opacity, color, background-color, border-color !important; animation: none !important }`.
- [ ] **Step 6:** `npx vitest run` → PASS; `npm run build` → sukses tanpa galat TS.
- [ ] **Step 7:** Commit `"Kerangka frontend React + Vite + Tailwind"`.

---

### Task 2: Aturan domain

**Files:**
- Create: `frontend/src/domain/faculty.ts`, `frontend/src/domain/skpi.ts`, `frontend/src/domain/format.ts`
- Test: `frontend/src/domain/faculty.test.ts`, `frontend/src/domain/skpi.test.ts`, `frontend/src/domain/format.test.ts`

**Interfaces:**
- Produces:
  - `type FacultyCode = 'FEB'|'FH'|'FKIP'|'FP'|'FT'|'FISIP'|'FMIPA'|'FK'`
  - `FACULTIES: { code: FacultyCode; name: string; unitCode: string; npmDigit: string; programs: string[] }[]` (nama & prodi dari `RANCANG/lib/data.ts`, `unitCode` & digit dari Global Constraints)
  - `facultyByCode(code): Faculty`, `facultyOfNpm(npm: string): FacultyCode | null`, `issuerLabel(code): string` → `"Dekan Fakultas …"`
  - `type Predicate = 'Unggul'|'Sangat Baik'|'Baik'|'Cukup'`; `predicateOf(total: number): Predicate | null` (null bila < 25); `predicateRange(p): string`
  - `interface SkpiInput { npm: string; name: string; skpiId: string; programStudy: string; totalSKP: number }`
  - `interface SkpiForm { npm: string; name: string; skpiId: string; programStudy: string; totalSKP: string }`
  - `type FormErrors = Partial<Record<keyof SkpiForm, string>>`
  - `normalizeNpm(v: string): string` (buang semua spasi), `normalizeName(v: string): string` (trim + spasi ganda → satu)
  - `validateSkpi(form: SkpiForm, faculty: FacultyCode): FormErrors`; `toInput(form): SkpiInput`; `toForm(input): SkpiForm`
  - `validateReason(v: string): string | undefined`
  - `formatDate(iso)`, `formatDateTime(iso)` (WIB, `Intl` id-ID, dari rancangan), `shortHash(h)`

- [ ] **Step 1: Tulis test gagal** `skpi.test.ts`:
  - `predicateOf(226) === 'Unggul'`, `predicateOf(225) === 'Sangat Baik'`, `predicateOf(151) === 'Sangat Baik'`, `predicateOf(150) === 'Baik'`, `predicateOf(76) === 'Baik'`, `predicateOf(75) === 'Cukup'`, `predicateOf(25) === 'Cukup'`, `predicateOf(24) === null`.
  - `validateSkpi` dengan form valid FMIPA `{npm:'2317051001', name:'Nabila Azzahra', skpiId:'001/UN26.17/SKPI/2026', programStudy:'S1 Ilmu Komputer', totalSKP:'236'}` → `{}`.
  - NPM `'2315051001'` dengan fakultas FMIPA → `errors.npm` memuat `"bukan mahasiswa FMIPA"`; `'23170510'` → `"10 digit"`; `' 2317 051 001 '` → valid (dinormalisasi).
  - `skpiId '001/UN26.15/SKPI/2026'` untuk FMIPA → `errors.skpiId` memuat `"UN26.17"`; `'1/UN26.17/SKPI/2026'` → galat format; panjang 65 → galat.
  - `totalSKP '24'` → galat memuat `"minimal 25"`; `'25.5'` → galat bilangan bulat.
  - `name` berisi `'\u0007'` → galat; 101 karakter → galat.
  - `validateReason('pendek')` → galat; 501 karakter → galat; 10 karakter → `undefined`.
- [ ] **Step 2:** `faculty.test.ts`: `facultyOfNpm('2317051001') === 'FMIPA'`, `facultyOfNpm('2309051001') === null`, `issuerLabel('FT') === 'Dekan Fakultas Teknik'`. `format.test.ts`: `formatDateTime('2026-06-18T02:00:00Z')` mengandung `"09.00"` dan diakhiri `"WIB"`.
- [ ] **Step 3:** `npx vitest run src/domain` → FAIL.
- [ ] **Step 4:** Implementasi tiga file. Pesan galat persis: `"NPM harus 10 digit angka."`, `` `NPM ${npm} bukan mahasiswa ${faculty}.` ``, `"Format nomor SKPI: NNN/UN26.KK/SKPI/YYYY."`, `` `Kode unit harus ${unitCode} untuk ${faculty}.` ``, `"Total SKP harus bilangan bulat."`, `"Total SKP minimal 25."`, `"Nama lulusan wajib diisi (maks. 100 karakter)."`, `"Program studi tidak ada di fakultas ini."`, `"Alasan minimal 10 karakter."`, `"Alasan maksimal 500 karakter."`.
- [ ] **Step 5:** `npx vitest run src/domain` → PASS.
- [ ] **Step 6:** Commit `"Aturan domain SKPI mengikuti chaincode"`.

---

### Task 3: Tipe API dan klien tiruan

**Files:**
- Create: `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/api/errors.ts`, `frontend/src/api/mock/store.ts`, `frontend/src/api/mock/seed.ts`, `frontend/src/api/mock/mockClient.ts`
- Test: `frontend/src/api/mock/mockClient.test.ts`

**Interfaces:**
- Consumes: semua dari Task 2.
- Produces (`types.ts`):
  ```ts
  type Role = 'admin' | 'dekan' | 'rektor'
  interface User { id: string; name: string; role: Role; faculty: FacultyCode | null; actorId: string }
  type LedgerStatus = 'MENUNGGU_REKTOR' | 'AKTIF' | 'DITOLAK_REKTOR' | 'DICABUT'
  type RecordStatus = 'MENUNGGU_DEKAN' | 'DITOLAK_DEKAN' | LedgerStatus
  type DraftType = 'PENCATATAN' | 'PERUBAHAN' | 'PENCABUTAN'
  type DraftStatus = 'MENUNGGU_DEKAN' | 'DITOLAK_DEKAN' | 'DISETUJUI'
  interface Draft { id: string; type: DraftType; status: DraftStatus; npm: string; facultyCode: FacultyCode;
    data: Omit<SkpiInput,'npm'> | null; reason: string | null; rejectReason: string | null;
    createdBy: string; createdAt: string; updatedAt: string }
  interface SkpiRecord { npm: string; name: string; skpiId: string; programStudy: string; totalSKP: number;
    predicate: Predicate; facultyCode: FacultyCode; status: RecordStatus; issuedTimestamp: string | null;
    rektorTimestamp: string | null; reason: string | null; pendingDraft: Draft | null; lastActivityAt: string }
  type HistoryAction = 'DIAJUKAN' | 'DITOLAK_DEKAN' | 'SahkanDekan' | 'SahkanRektor' | 'TolakRektor' | 'PerbaruiSKPI' | 'CabutSKPI'
  interface FieldChange { field: keyof Omit<SkpiInput,'npm'>; from: string; to: string }
  interface HistoryEntry { kind: 'ledger' | 'offchain'; action: HistoryAction; at: string; actor: string;
    txId: string | null; note: string | null; changes: FieldChange[] }
  interface RecordDetail extends SkpiRecord { history: HistoryEntry[] }   // urut lama → baru
  type QueueItem = { kind: 'draft'; draft: Draft; record: SkpiRecord | null } | { kind: 'rektor'; record: SkpiRecord }
  type RecordFilter = 'ALL' | 'PENDING' | 'AKTIF' | 'DICABUT' | 'DITOLAK'
  interface ActivityItem { npm: string; name: string; action: HistoryAction; kind: 'ledger'|'offchain'; at: string; txId: string | null }
  type VerifyStatus = 'TERDAFTAR' | 'DICABUT' | 'BELUM_SAH' | 'TIDAK_TERDAFTAR'
  interface PublicSkpi { npm; name; skpiId; programStudy; totalSKP: number; predicate: Predicate; issuer: string;
    issuedTimestamp: string; rektorTimestamp: string; status: LedgerStatus }
  interface VerifyResult { status: VerifyStatus; data: PublicSkpi | null; rektorName: string | null }
  interface VerifyCandidate { npm: string; name: string; programStudy: string; facultyCode: FacultyCode }
  interface BatchResult { created: Draft[]; errors: { index: number; npm: string; message: string }[] }
  ```
- Produces (`client.ts`): `interface ApiClient` dengan metode
  `login({identifier,password,role}): Promise<User>`, `me(): Promise<User|null>`, `logout(): Promise<void>`,
  `listRecords(f?: {status?: RecordFilter; q?: string}): Promise<SkpiRecord[]>`, `getRecord(npm): Promise<RecordDetail>`,
  `activity(limit: number): Promise<ActivityItem[]>`, `listQueue(): Promise<QueueItem[]>`,
  `createDraft(i: {type: DraftType; npm: string; data?: Omit<SkpiInput,'npm'>; reason?: string}): Promise<Draft>`,
  `createDrafts(items: SkpiInput[]): Promise<BatchResult>`, `updateDraft(id, data: Omit<SkpiInput,'npm'>): Promise<Draft>`,
  `approveDraft(id): Promise<{txId: string}>`, `rejectDraft(id, reason): Promise<Draft>`,
  `rektorApprove(npm): Promise<{txId: string}>`, `rektorReject(npm, reason): Promise<{txId: string}>`,
  `searchPublic(q): Promise<{candidates: VerifyCandidate[]; truncated: boolean}>`, `verify(npm): Promise<VerifyResult>`,
  `ledgerInfo(): Promise<{channel: string; msp: string}>`.
- Produces (`errors.ts`): `class ApiError extends Error { constructor(public status: number, public code: string, message: string) }`, `userMessage(e: unknown): string`.
- Produces (`mockClient.ts`): `createMockClient(opts?: { latencyMs?: number; seed?: boolean; now?: () => Date }): ApiClient`. Akun seed (sandi semua `skpi-demo-2026`): `admin.fmipa@unila.ac.id` (admin FMIPA), `admin.ft@unila.ac.id` (admin FT), `dekan.fmipa@unila.ac.id`, `dekan.ft@unila.ac.id`, `rektor@unila.ac.id`. `actorId` = `dekan-fmipa@UnilaMSP` dst. (`pengesah.conf`), admin = `admin.fmipa (off-chain)`. Nama rektor dari tabel periode contoh `[{ name: 'Rektor Contoh Periode 2023–2027', from: '2023-01-01', to: '2027-12-31' }]`.

Aturan status rekaman: draft `PENCATATAN` tertunda (MENUNGGU/DITOLAK_DEKAN) menentukan `status`; selain itu status aset. Draft `PERUBAHAN`/`PENCABUTAN` tertunda → `pendingDraft`, status tetap `AKTIF`. Filter `PENDING` = MENUNGGU_DEKAN + MENUNGGU_REKTOR; `DITOLAK` = DITOLAK_DEKAN + DITOLAK_REKTOR. Lingkup: admin & dekan hanya `facultyCode` mereka; rektor semua.

- [ ] **Step 1: Tulis test gagal** `mockClient.test.ts` (klien `createMockClient({ latencyMs: 0, seed: false })`, helper `loginAs(client, email)`):
  1. `login` sandi salah → `ApiError` status 401; peran tidak cocok (admin memilih `dekan`) → 403.
  2. Admin FMIPA `createDraft({type:'PENCATATAN', npm:'2317051001', data})` → `listRecords()` berisi rekaman status `MENUNGGU_DEKAN`; NPM FT (`2315051001`) → 403; `totalSKP: 20` → 400.
  3. Dekan FMIPA `listQueue()` berisi draft itu; `approveDraft` → `txId` 64-hex; rekaman menjadi `MENUNGGU_REKTOR`, `issuedTimestamp` terisi; `getRecord` history `['DIAJUKAN','SahkanDekan']` dengan `kind` `offchain`, `ledger`.
  4. Dekan FT tidak melihat draft FMIPA di `listQueue()`; `approveDraft` draft FMIPA → 403.
  5. `rejectDraft(id, 'Nomor SKPI tidak sesuai dokumen')` → status `DITOLAK_DEKAN`, `reason` terisi; tidak ada entri `ledger` di history; admin `updateDraft` → kembali `MENUNGGU_DEKAN`.
  6. Rektor `rektorApprove` → `AKTIF`; `rektorReject` → `DITOLAK_REKTOR` dan `skpiId` bisa dipakai NPM lain.
  7. Admin `createDraft PERUBAHAN` pada AKTIF → `pendingDraft.type === 'PERUBAHAN'`, status tetap `AKTIF`; draft kedua untuk NPM yang sama selagi tertunda → 409; dekan setuju → data baru, history `PerbaruiSKPI` dengan `changes` `[{field:'totalSKP', from:'180', to:'230'}]`, `issuedTimestamp` tidak berubah.
  8. `PENCABUTAN` disetujui → `DICABUT`; `createDraft PENCATATAN` untuk NPM DICABUT diizinkan.
  9. `skpiId` yang sudah dipakai NPM lain (AKTIF) → 409.
  10. `verify`: AKTIF → `TERDAFTAR` dengan `data` tanpa properti `reason`/`revocationReason`, `rektorName` terisi; DICABUT → `DICABUT`; MENUNGGU_REKTOR → `{status:'BELUM_SAH', data:null}`; MENUNGGU_DEKAN/tidak ada → `TIDAK_TERDAFTAR`.
  11. `searchPublic('Budi')` dengan 12 lulusan bernama "Budi Santoso" berstatus AKTIF → 10 kandidat, `truncated: true`; kandidat hanya dari rekaman yang pernah masuk ledger (bukan draft); pencarian tidak peka huruf dan spasi ganda.
  12. `createDrafts` dengan satu baris valid dan satu NPM ganda → `created.length === 1`, `errors[0].index === 1`.
- [ ] **Step 2:** `npx vitest run src/api/mock` → FAIL.
- [ ] **Step 3:** Implementasi `store.ts` (Map `drafts`, `assets`, `history`; tanpa singleton global — dibuat per klien), `mockClient.ts` (setiap metode memvalidasi sesi & peran, memakai `validateSkpi`/`validateReason`, menghasilkan txId 64-hex dengan `crypto.getRandomValues`, menunda `latencyMs` dengan `setTimeout`), `errors.ts` (pemetaan `userMessage`: 401 "Sesi berakhir, silakan masuk kembali.", 403 "Anda tidak berwenang untuk tindakan ini.", 409 pesan server, 429 "Terlalu banyak permintaan, coba lagi dalam beberapa saat.", 502/503 "Layanan ledger sedang tidak terjangkau.", lainnya pesan server atau "Terjadi kesalahan.").
- [ ] **Step 4:** `seed.ts`: `seedStore(store, now)` mengisi FMIPA dan FT dengan semua status di spec §5.2 (min. 12 rekaman), termasuk 1 AKTIF dengan `pendingDraft` PERUBAHAN, 1 AKTIF dengan PENCABUTAN tertunda, 1 DITOLAK_DEKAN, 1 DITOLAK_REKTOR, 1 DICABUT, 2 MENUNGGU_REKTOR, 2 MENUNGGU_DEKAN, dan dua lulusan bernama sama "Rizky Maulana" (FMIPA dan FT). `skpiId` memakai format chaincode. Tambah test: `createMockClient({latencyMs:0})` (seed default `true`) → `listRecords` rektor menghasilkan setiap `RecordStatus` minimal sekali.
- [ ] **Step 5:** `npx vitest run src/api` → PASS.
- [ ] **Step 6:** Commit `"Kontrak API frontend dan klien tiruan"`.

---

### Task 4: Klien HTTP

**Files:**
- Create: `frontend/src/api/httpClient.ts`, `frontend/src/api/index.ts`
- Test: `frontend/src/api/httpClient.test.ts`

**Interfaces:**
- Consumes: `ApiClient`, `ApiError` (Task 3).
- Produces: `createHttpClient(base = '/api', fetchImpl = fetch): ApiClient`; `api: ApiClient` di `index.ts` = `import.meta.env.VITE_API_MODE === 'mock' ? createMockClient({ latencyMs: 350 }) : createHttpClient()`.

- [ ] **Step 1: Tulis test gagal** dengan `fetchImpl = vi.fn()`:
  - `verify('2317051001')` memanggil `GET /api/verify/2317051001` dengan `credentials: 'include'`.
  - `searchPublic('Budi Santoso')` memanggil `/api/verify?q=Budi%20Santoso`.
  - `approveDraft('d1')` → `POST /api/drafts/d1/approve`; `rektorReject('2317051001','alasan…')` → `POST /api/records/2317051001/rektor/reject` body `{"reason":"alasan…"}`.
  - Respons 409 `{error:{code:'CONFLICT',message:'NPM sudah memiliki draft'}}` → melempar `ApiError` `status 409`, `code 'CONFLICT'`, `message` sama.
  - Respons 503 tanpa body JSON → `ApiError` status 503, `code 'UNAVAILABLE'`.
  - `fetch` menolak (jaringan putus) → `ApiError` status 0, `code 'NETWORK'`; `userMessage` → "Layanan ledger sedang tidak terjangkau."
  - `me()` dengan 401 → `null` (bukan lempar).
- [ ] **Step 2:** `npx vitest run src/api/httpClient.test.ts` → FAIL.
- [ ] **Step 3:** Implementasi mengikuti tabel spec §6 (path persis). Tambahkan status 0 ke pemetaan `userMessage` di `errors.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `"Klien HTTP sesuai kontrak API"`.

---

### Task 5: Komponen UI dan rantai pengesahan

**Files:**
- Create: `frontend/src/components/ui/` — `cx.ts`, `Badge.tsx`, `Button.tsx`, `Field.tsx` (Field, Input, Select, Textarea), `Modal.tsx`, `Drawer.tsx`, `Hash.tsx`, `PageHeader.tsx` (PageHeader, SectionTitle, `th`, `td`), `Brand.tsx`, `index.ts`
- Create: `frontend/src/components/useExitTransition.ts`
- Create: `frontend/src/domain/status.ts`, `frontend/src/domain/custody.ts`
- Create: `frontend/src/components/Custody.tsx` (CustodyBar, CustodySteps)
- Test: `frontend/src/domain/custody.test.ts`, `frontend/src/components/ui/Modal.test.tsx`, `frontend/src/components/ui/Button.test.tsx`

**Interfaces:**
- Consumes: tipe Task 3.
- Produces:
  - `STATUS_META: Record<RecordStatus, { label: string; tone: Tone }>`: `MENUNGGU_DEKAN 'Menunggu Dekan' pending`, `DITOLAK_DEKAN 'Ditolak Dekan' muted`, `MENUNGGU_REKTOR 'Menunggu Rektor' pending`, `AKTIF 'Aktif' ok`, `DITOLAK_REKTOR 'Ditolak Rektor' muted`, `DICABUT 'Dicabut' revoked`. `DRAFT_TYPE_LABEL: Record<DraftType,string>` = Pencatatan/Perubahan/Pencabutan. `ACTION_LABEL: Record<HistoryAction,string>`.
  - `type StageState = 'done'|'current'|'pending'|'rejected'|'revoked'`; `custody(status: RecordStatus, history: HistoryEntry[]): Stage[]` dengan `Stage { key: 'admin'|'dekan'|'rektor'|'ledger'; label; sub; state; stateLabel; event?: HistoryEntry }`.
  - `useExitTransition(open: boolean, exitMs: number): { mounted: boolean; state: 'open' | 'closed' }` — tetap ter-mount `exitMs` setelah `open` menjadi false; `state` `'closed'` pada frame pertama saat buka agar transisi masuk berjalan.
  - Komponen dengan props sama seperti `RANCANG/components/ui.tsx`, kecuali: `Toast` dihapus (diganti Sonner, Task 6); `Button` menerima `loading?: boolean` (nonaktif + label crossfade); `CustodyBar/CustodySteps` menerima `{ status: RecordStatus; history?: HistoryEntry[] }`.

- [ ] **Step 1: Tulis test gagal** `custody.test.ts`:
  - `MENUNGGU_DEKAN` → state `['done','current','pending','pending']`, `stateLabel` admin `'Diajukan'`.
  - `DITOLAK_DEKAN` → `['done','rejected','pending','pending']`.
  - `MENUNGGU_REKTOR` → `['done','done','current','pending']`; event dekan = entri `SahkanDekan`.
  - `AKTIF` → `['done','done','done','done']`; `DITOLAK_REKTOR` → `['done','done','rejected','pending']`; `DICABUT` → `['done','done','done','revoked']`, event ledger = entri `CabutSKPI`.
- [ ] **Step 2:** `Modal.test.tsx` (fake timers): `open` → dialog ada dengan `data-state="open"` setelah satu frame; tekan Escape → `onClose` dipanggil sekali; rerender `open={false}` → dialog masih ada dengan `data-state="closed"`, setelah `vi.advanceTimersByTime(150)` hilang. `Button.test.tsx`: `<Button loading>Sahkan</Button>` → `disabled`, `aria-busy="true"`; className tidak memuat `transition-all` dan memuat `active:scale-[0.97]`.
- [ ] **Step 3:** `npx vitest run src/domain/custody.test.ts src/components` → FAIL.
- [ ] **Step 4:** Implementasi. Port markup & kelas dari `RANCANG/components/ui.tsx` dengan perubahan gerak:
  - Button/IconButton: `transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] active:scale-[0.97]`; konten dalam `<span>` yang saat `loading` berpindah ke label kedua dengan `opacity` + `blur-[2px]` 200ms.
  - Modal: backdrop `transition-opacity 200ms`; panel `opacity/scale 0.96→1` 200ms `--ease-out`, keluar 150ms; `exitMs = 150`; origin tengah; fokus ke panel saat buka, kembali ke pemicu saat tutup.
  - Drawer: panel `translate-x-full → 0` 300ms `--ease-drawer`, keluar 200ms (`exitMs = 200`); `pb-[env(safe-area-inset-bottom)]` pada footer.
  - Hash: ikon salin ↔ centang crossfade `opacity + scale(0.8→1)` 150ms (dua ikon bertumpuk, bukan unmount).
  - StageNode/CustodySteps: stage `admin` berlabel "Admin fakultas", sub "Draft off-chain"; event off-chain tampil tanpa baris tx; event ledger menampilkan `Hash` txId, tanpa nomor blok.
- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit `"Komponen UI dan rantai pengesahan dengan transisi keluar"`.

---

### Task 6: Sesi, routing, Shell

**Files:**
- Create: `frontend/src/app/session.tsx`, `frontend/src/app/ApiProvider.tsx`, `frontend/src/app/router.tsx`, `frontend/src/components/Shell.tsx`, `frontend/src/components/PublicNav.tsx`
- Modify: `frontend/src/App.tsx` (pakai router + `<Toaster />` Sonner), `frontend/src/App.test.tsx`
- Test: `frontend/src/app/router.test.tsx`, `frontend/src/test/renderApp.tsx` (helper)

**Interfaces:**
- Consumes: `ApiClient`, `User`, `Role`, `userMessage`.
- Produces:
  - `ApiProvider({ client, children })`, `useApi(): ApiClient`.
  - `SessionProvider`, `useSession(): { user: User | null; loading: boolean; login(i): Promise<User>; logout(): Promise<void> }`; ketika panggilan API melempar 401, sesi dikosongkan dan diarahkan ke `/masuk`.
  - Rute: `/` → `/verifikasi`; `/masuk`; `/ikhtisar` (semua staf); `/catat` (admin); `/antrean` (dekan, rektor); `/daftar`, `/daftar/:npm` (staf); `/verifikasi`, `/verifikasi/:npm` (publik). Rute staf tanpa sesi → `/masuk?next=<path>`; peran salah → `/ikhtisar`.
  - `renderApp(path: string, opts?: { client?: ApiClient; as?: string /* email */ }): Promise<{ user: UserEvent; client: ApiClient }>` — membuat mock client `latencyMs: 0`, login bila `as` diberikan, render `<App>` dengan `MemoryRouter`.
  - `notify` = `toast` dari `sonner` (dipakai layar).
- [ ] **Step 1: Tulis test gagal** `router.test.tsx`:
  - `renderApp('/ikhtisar')` tanpa sesi → heading "Masuk ke Sistem Pengesahan SKPI".
  - `renderApp('/catat', { as: 'dekan.fmipa@unila.ac.id' })` → diarahkan ke Ikhtisar.
  - Admin: navigasi memuat "Catat SKPI", tidak memuat "Antrean pengesahan"; dekan: memuat "Antrean pengesahan" dengan lencana jumlah antrean dari seed; tidak ada teks "Peran demo".
  - Breadcrumb dekan memuat `UnilaMSP` dan `FMIPA`; profil sidebar menampilkan `dekan-fmipa@UnilaMSP`.
  - Tombol "Keluar" → kembali ke halaman masuk.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementasi. `Shell` dan `PublicNav` diport dari `RANCANG/components/Shell.tsx`: hapus blok "Peran demo"; header kanan menampilkan `{channel} · {msp}` dari `ledgerInfo()` (tanpa nomor blok); sidebar seluler masuk dengan `translate-x` 250ms `--ease-drawer` (bukan muncul seketika), backdrop opacity; header `pt-[env(safe-area-inset-top)]`. Pergantian rute staf: wrapper konten dengan `key={pathname}` dan transisi opacity 120ms saja. `<Toaster position="bottom-right" richColors={false} />` dengan gaya gelap rancangan (`bg-[#0F172A] text-white`).
- [ ] **Step 4:** Run → PASS; `App.test.tsx` diperbarui: `/verifikasi` menampilkan heading portal publik (dibuat penuh di Task 12; untuk sekarang rute merender placeholder berheading "Portal verifikasi").
- [ ] **Step 5:** Commit `"Sesi, routing berperan, dan shell aplikasi"`.

---

### Task 7: Layar Masuk

**Files:**
- Create: `frontend/src/screens/Login.tsx`
- Test: `frontend/src/screens/Login.test.tsx`

**Interfaces:**
- Consumes: `useSession().login`, `userMessage`.

- [ ] **Step 1: Tulis test gagal**:
  - Kirim kosong → "Email, NIP, atau NIDN wajib diisi." dan "Kata sandi wajib diisi.".
  - Peran default "Admin Fakultas"; panah kanan memindah pilihan ke "Dekan" (radiogroup).
  - Login `dekan.fmipa@unila.ac.id` / `skpi-demo-2026` dengan peran Dekan → halaman Ikhtisar.
  - Peran Rektor untuk akun dekan → pesan "Anda tidak berwenang untuk tindakan ini." tampil di formulir (role `alert`), tetap di halaman masuk.
  - Selama permintaan berjalan tombol `aria-busy="true"` dan klik kedua tidak memanggil `login` lagi.
  - `?next=/daftar` → setelah masuk berada di Daftar.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Port `RANCANG/screens/Login.tsx`. Ubah: `ROLE_OPTIONS` id `admin|dekan|rektor`, duty admin "Membuat draft SKPI fakultas"; seal ketiga → nama "Pengesahan Bertingkat", desc "Dekan lalu Rektor menandatangani dengan identitas X.509 masing-masing sebelum SKPI aktif.", spec `"2 tanda tangan"`; baris delegasi menampilkan contoh `dekan-fmipa@UnilaMSP` untuk dekan, `rektor@UnilaMSP` untuk rektor, dan untuk admin teks "Admin fakultas tidak memegang identitas Fabric; draft disimpan off-chain."; ganti `setTimeout` palsu dengan `await login(...)`; galat server ditampilkan di atas tombol. Saat `import.meta.env.VITE_API_MODE === 'mock'`, tampilkan kotak "Akun demo" berisi daftar email seed (tidak tampil di build production).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `"Layar masuk dengan peran admin fakultas, dekan, rektor"`.

---

### Task 8: Ikhtisar

**Files:**
- Create: `frontend/src/screens/Overview.tsx`
- Test: `frontend/src/screens/Overview.test.tsx`

**Interfaces:**
- Consumes: `listRecords()`, `listQueue()`, `activity(7)`, `STATUS_META`, `CustodyBar`.

- [ ] **Step 1: Tulis test gagal** (seed):
  - Rektor: kartu "Menunggu Dekan", "Menunggu Rektor", "Aktif" menampilkan hitungan sama dengan `listRecords` per status; sisi "Dicabut" dan "Ditolak" (DITOLAK_DEKAN + DITOLAK_REKTOR); kartu "Tahap Anda" pada Menunggu Rektor.
  - Admin FMIPA: judul tabel "Ditolak · perlu perbaikan" berisi rekaman DITOLAK_DEKAN FMIPA beserta alasan; tidak ada rekaman FT.
  - Dekan: tombol "Buka antrean (N)" dengan N = panjang `listQueue()`.
  - Aktivitas: entri off-chain berlabel "off-chain" tanpa tombol salin hash; entri ledger memiliki tombol "Salin hash transaksi".
  - Klik kartu "Aktif" → `/daftar?status=AKTIF`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Port `RANCANG/screens/Overview.tsx`. Ubah: `DESCRIPTION.admin` = "Ajukan draft SKPI lulusan fakultas Anda, lalu pantau pengesahannya oleh Dekan dan Rektor."; hint "Dikembalikan ke jurusan" → "Ditolak Dekan atau Rektor"; feed menampilkan `#` kolom kiri sebagai jam (`HH.mm`) karena tidak ada nomor blok; rektor melihat semua fakultas (deskripsi "seluruh fakultas"). Tanpa animasi angka.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `"Layar ikhtisar per peran"`.

---

### Task 9: Catat SKPI (satuan, batch, bukti)

**Files:**
- Create: `frontend/src/screens/record/RecordScreen.tsx`, `frontend/src/screens/record/SingleForm.tsx`, `frontend/src/screens/record/BatchForm.tsx`, `frontend/src/screens/record/Receipt.tsx`, `frontend/src/domain/csv.ts`
- Test: `frontend/src/domain/csv.test.ts`, `frontend/src/screens/record/Record.test.tsx`

**Interfaces:**
- Consumes: `validateSkpi`, `toInput`, `predicateOf`, `createDraft`, `createDrafts`, `useSession().user.faculty`.
- Produces: `parseCsv(text: string): SkpiForm[]` dan `CSV_TEMPLATE: string` (header `npm,name,skpiId,programStudy,totalSKP` + 2 contoh FMIPA). Rute `/catat?npm=<npm>` mengisi awal NPM pada mode Satuan (dipakai "Catat ulang" di Task 11).

- [ ] **Step 1: Tulis test gagal** `csv.test.ts`: koma; titik koma; BOM `﻿` di awal; baris kosong diabaikan; kolom berkutip berisi koma (`"Putri, S."`); header dengan urutan berbeda tetap dipetakan; header tidak dikenal → lempar `Error('Kolom wajib: npm, name, skpiId, programStudy, totalSKP')`.
- [ ] **Step 2:** `Record.test.tsx` (admin FMIPA):
  - Satuan: isi NPM `2315051001` → galat "bukan mahasiswa FMIPA" setelah blur/kirim; `skpiId` `001/UN26.15/SKPI/2026` → "Kode unit harus UN26.17"; total `226` → pratinjau predikat "Unggul" dan rentang "> 225".
  - Tidak ada input "Issuer" dan "Waktu terbit"; fakultas tampil sebagai teks baca "FMIPA · UN26.17".
  - Kirim valid → layar bukti dengan heading "Draft diajukan ke Dekan." dan teks "belum masuk ledger"; tidak ada "ID transaksi". Klik ganda tombol "Ajukan ke Dekan" → `createDraft` dipanggil sekali (spy).
  - Batch: tempel CSV 3 baris (1 salah fakultas) → tabel menandai 1 baris galat; tombol "Ajukan 2 SKPI"; galat server per baris dari `BatchResult.errors` ditampilkan pada barisnya.
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Port `RANCANG/screens/Record.tsx` dan pecah ke file di atas. Ubah: eyebrow "Draft off-chain", title "Ajukan SKPI ke Dekan", deskripsi "Draft disimpan di basis data aplikasi dan belum masuk blockchain. Data baru tercatat di ledger setelah Dekan menyetujui."; hapus `PHASES` endorsement (diganti status tombol "Menyimpan draft…"); pratinjau "Pratinjau aset" menampilkan field yang akan dikirim ke `SahkanDekan` plus baris `issuer`/`issuedTimestamp` bernilai "diisi saat Dekan menyetujui"; kotak "Setelah dikirim" berisi tahap Admin · diajukan → Dekan · menunggu → Rektor · menunggu → Ledger · aktif. Kolom CSV mengikuti `CSV_TEMPLATE`.
- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit `"Layar pengajuan draft SKPI satuan dan batch"`.

---

### Task 10: Antrean pengesahan (dekan & rektor)

**Files:**
- Create: `frontend/src/screens/approvals/ApprovalsScreen.tsx`, `frontend/src/screens/approvals/ReviewModal.tsx`, `frontend/src/screens/approvals/BulkModal.tsx`
- Test: `frontend/src/screens/approvals/Approvals.test.tsx`

**Interfaces:**
- Consumes: `listQueue`, `getRecord`, `approveDraft`, `rejectDraft`, `rektorApprove`, `rektorReject`, `validateReason`, `notify`.

- [ ] **Step 1: Tulis test gagal**:
  - Dekan FMIPA: kolom "Jenis" dengan nilai Pencatatan/Perubahan/Pencabutan dari seed; eyebrow "Pengesahan Dekan".
  - Tinjau draft Perubahan → tabel "Sebelum / Sesudah" hanya baris field yang berubah; tombol "Setujui (PerbaruiSKPI)".
  - Tinjau draft Pencabutan → menampilkan alasan; tombol "Setujui (CabutSKPI)" bervarian `dangerSolid`.
  - Setujui pencatatan → `approveDraft` sekali walau diklik dua kali; toast "SKPI disahkan · diteruskan ke Rektor"; baris hilang dari antrean.
  - Tolak: alasan 5 karakter → tombol nonaktif; alasan valid → `rejectDraft`; hint "Alasan disimpan off-chain dan terlihat oleh admin fakultas."
  - Massal 3 draft dengan satu gagal (stub `approveDraft` melempar `ApiError(409,…)` untuk satu id) → modal hasil menampilkan 2 berhasil, 1 gagal beserta pesannya; yang gagal tetap di antrean.
  - Rektor: daftar MENUNGGU_REKTOR lintas FMIPA & FT; tidak ada kolom "Jenis"; Tolak → `rektorReject` dan hint "Alasan dicatat di ledger (TolakRektor)."; toast setujui "SKPI disahkan · kini aktif di ledger".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Port `RANCANG/screens/Approvals.tsx`. Ubah: kolom "Waktu terbit" → "Diajukan" (dekan) / "Disahkan Dekan" (rektor); bilah "n dipilih" muncul dengan transisi `opacity + translateY(8px)` 200ms `--ease-out` (tetap ter-mount, `data-state`), bukan keyframe; massal dijalankan berurutan satu per satu dengan progres "Mengesahkan 2/3…"; modal tinjau menampilkan `CustodySteps` dari `getRecord(npm)` dan "Anda menandatangani sebagai {user.actorId}".
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `"Antrean pengesahan dekan dan rektor"`.

---

### Task 11: Daftar & riwayat

**Files:**
- Create: `frontend/src/screens/registry/RegistryScreen.tsx`, `frontend/src/screens/registry/RecordDrawer.tsx`, `frontend/src/screens/registry/DraftFormModal.tsx`, `frontend/src/screens/registry/RevokeModal.tsx`
- Test: `frontend/src/screens/registry/Registry.test.tsx`

**Interfaces:**
- Consumes: `listRecords`, `getRecord`, `createDraft`, `updateDraft`, `SingleForm` field set (Task 9) — `DraftFormModal` memakai `validateSkpi` dengan NPM baca-saja.
- Rute: `/daftar?status=…&q=…` (filter tersimpan di URL), `/daftar/:npm` membuka drawer.

- [ ] **Step 1: Tulis test gagal**:
  - Tab "Semua/Dalam pengesahan/Aktif/Dicabut/Ditolak" dengan hitungan sesuai seed lingkup peran; `?status=DICABUT` membuka tab Dicabut.
  - Rekaman AKTIF dengan perubahan tertunda menampilkan penanda "Perubahan diajukan".
  - `/daftar/:npm` rekaman AKTIF → drawer berisi riwayat: entri `SahkanDekan` dan `SahkanRektor` dengan tombol salin hash dan penanda tangan `dekan-fmipa@UnilaMSP`; entri `DIAJUKAN` berlabel off-chain; entri `PerbaruiSKPI` menampilkan "Total SKP: 180 → 230".
  - Admin pada AKTIF tanpa draft tertunda: tombol "Ajukan perubahan" dan "Ajukan pencabutan"; pada AKTIF dengan draft tertunda: keduanya tidak ada, teks "Menunggu keputusan Dekan atas draft perubahan".
  - Admin pada DITOLAK_DEKAN: "Perbaiki & ajukan ulang" → modal berisi data draft, alasan penolakan tampil; simpan → `updateDraft`.
  - Admin pada DICABUT/DITOLAK_REKTOR: "Catat ulang" → `/catat` dengan NPM terisi.
  - Ajukan pencabutan: perlu alasan ≥ 10 dan ketik ulang NPM; kirim → `createDraft({type:'PENCABUTAN', npm, reason})`; toast "Draft pencabutan diajukan ke Dekan".
  - Dekan/rektor: drawer tanpa tombol aksi, teks "Perubahan dan pencabutan diajukan oleh admin fakultas."
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Port `RANCANG/screens/Registry.tsx`. Ubah: filter prodi tetap; kolom "Waktu terbit" kosong ("—") untuk rekaman off-chain; kolom "Transaksi terakhir" → "Aktivitas terakhir" (label `ACTION_LABEL`, off-chain diberi teks kecil "off-chain"); `AmendModal` → `DraftFormModal` (judul "Ajukan perubahan" / "Perbaiki & ajukan ulang", tanpa issuer/waktu terbit, tombol "Ajukan ke Dekan"); `RevokeModal` judul "Ajukan pencabutan SKPI {nama}?", deskripsi "Pencabutan berlaku setelah Dekan menyetujui (CabutSKPI)."
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `"Daftar dan riwayat SKPI dengan draft perubahan dan pencabutan"`.

---

### Task 12: Portal & hasil verifikasi publik

**Files:**
- Create: `frontend/src/screens/verify/PublicVerify.tsx`, `frontend/src/screens/verify/Candidates.tsx`, `frontend/src/screens/verify/VerifyResult.tsx`
- Test: `frontend/src/screens/verify/Verify.test.tsx`

**Interfaces:**
- Consumes: `searchPublic`, `verify`, `normalizeNpm`, `userMessage`, `issuerLabel`.
- Rute: `/verifikasi` (formulir; `?q=` menampilkan kandidat di bawah formulir), `/verifikasi/:npm` (hasil).

- [ ] **Step 1: Tulis test gagal**:
  - Satu isian berlabel "NPM atau nama lulusan"; `"2317 0510 01"` → navigasi `/verifikasi/2317051001` tanpa memanggil `searchPublic`.
  - `"ri"` → "Masukkan minimal 3 huruf nama atau 10 digit NPM."
  - `"rizky maulana"` → dua kandidat (FMIPA & FT) menampilkan NPM dan prodi; klik salah satu → hasil.
  - 12 nama sama → 10 kandidat + teks "Hasil dibatasi 10, perjelas nama atau gunakan NPM".
  - `TERDAFTAR`: heading "Terdaftar", tabel metadata (Nama, NPM, Nomor SKPI, Program studi, Total SKP, Predikat, Penerbit, Waktu terbit), bagian penanda tangan memuat nama rektor dan waktu `rektorTimestamp`; tidak ada teks "ID transaksi" dan tidak ada kolom "Masukan".
  - `DICABUT`: heading "Dicabut", tidak ada teks "Alasan pencabutan"; ada teks "Hubungi Universitas Lampung untuk keterangan pencabutan."
  - `BELUM_SAH`: heading "Belum sah", teks "SKPI sedang menunggu pengesahan Rektor dan belum dapat dijadikan bukti."
  - `TIDAK_TERDAFTAR`: heading "Tidak terdaftar" dan daftar "Langkah berikutnya".
  - `verify` melempar `ApiError(429)` → pesan "Terlalu banyak permintaan…" pada role `alert`, tombol "Coba lagi" memanggil ulang; `ApiError(503)` → "Layanan ledger sedang tidak terjangkau."
  - Tombol "Data uji untuk demo" hanya bila `VITE_API_MODE === 'mock'`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Port `RANCANG/screens/PublicVerify.tsx` dan `VerifyResult.tsx`. Ubah: deskripsi formulir "Isi NPM atau nama lengkap lulusan sesuai dokumen."; `CHECKS` → ["Identitas lulusan", "NPM dan nama tercatat di ledger."], ["Dua tanda tangan", "Dekan fakultas penerbit dan Rektor telah mengesahkan SKPI."], ["Status terkini", "SKPI masih berlaku, sedang menunggu pengesahan, atau telah dicabut."]; "Cara membaca hasil" berisi 4 hasil (Belum sah bertone `pending`); `OUTCOME` ditambah `BELUM_SAH` (ikon `Clock3`, ring kuning); hapus panel "Bukti ledger", diganti panel gelap "Penanda tangan" (Dekan: `issuer` + `issuedTimestamp`; Rektor: `rektorName` + `rektorTimestamp`; Organisasi `UnilaMSP`, Kanal `skpi-channel`); `CustodySteps` diganti dua baris penanda tangan tersebut (riwayat tidak tersedia publik). Gerak: ikon status masuk `opacity 0 + scale(0.9) → 1` 250ms `--ease-out`, lalu blok judul, tabel, panel stagger 40ms (`transition-delay`), dimatikan oleh reduced-motion.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `"Portal verifikasi publik dengan NPM atau nama"`.

---

### Task 13: Image Docker dan dokumentasi

**Files:**
- Create: `frontend/Dockerfile`, `frontend/nginx/default.conf.template`, `frontend/.dockerignore`, `frontend/.env.example`
- Modify: `README.md` (bagian "Frontend"), `.gitignore` (tambah `frontend/node_modules`, `frontend/dist` bila belum)

**Interfaces:**
- Produces: image yang membaca `BACKEND_URL` (contoh `http://backend:3000`) saat start; port kontainer `8080`.

- [ ] **Step 1:** `Dockerfile` multi-stage: `node:22-alpine` → `npm ci && npm run build`; runtime `nginxinc/nginx-unprivileged:1.27-alpine`, salin `dist` ke `/usr/share/nginx/html`, template ke `/etc/nginx/templates/`. `default.conf.template`: `listen 8080`; `location /api/ { proxy_pass ${BACKEND_URL}; }` dengan header `X-Forwarded-For`/`X-Real-IP` (dibutuhkan rate limit backend); SPA `try_files $uri /index.html`; cache `immutable` untuk `/assets/`; header `X-Content-Type-Options nosniff`, `Referrer-Policy same-origin`, `Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'"`.
- [ ] **Step 2:** `.env.example` berisi `VITE_API_MODE=mock` (dev saja) dengan komentar bahwa build production mengabaikannya; README: cara `npm run dev` (mock), `npm test`, `docker build -t skpi-frontend frontend` dan `docker run -e BACKEND_URL=http://host.docker.internal:3000 -p 8080:8080 skpi-frontend`.
- [ ] **Step 3:** Verifikasi: `npm run typecheck` → 0 galat; `npx vitest run` → semua lulus; `npm run build` → sukses; `docker build -t skpi-frontend frontend` → sukses; `docker run --rm -d -p 8080:8080 -e BACKEND_URL=http://127.0.0.1:9 skpi-frontend` lalu `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/verifikasi` → `200` dan `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/verify/2317051001` → `502`.
- [ ] **Step 4:** Commit `"Image Docker frontend dan dokumentasi"`.

---

### Task 14: Pemeriksaan visual & gerak terhadap rancangan

**Files:**
- Modify: berkas layar/komponen yang menyimpang (hanya kelas/markup).

- [ ] **Step 1:** Jalankan `npm run dev` (mock) dan rancangan (`cd "../../Rancang Antarmuka Verifikasi SKPI" && npx vite --port 5174`). Bandingkan 7 layar pada lebar 1440 dan 390 px: tipografi, jarak, warna, border, ikon. Catat selisih dalam tabel Before/After/Why (format `emil-design-eng`) di deskripsi commit atau PR.
- [ ] **Step 2:** Periksa gerak: modal & drawer pada kecepatan 0.25× (DevTools Animations); keluar lebih cepat dari masuk; tidak ada `transition-all` (`grep -r "transition-all" src` → kosong); emulasi `prefers-reduced-motion: reduce` → tidak ada transform.
- [ ] **Step 3:** Seluler (390 px): tidak ada scroll horizontal halaman (tabel scroll di wadahnya), input tidak memicu zoom, sidebar dapat dibuka/ditutup.
- [ ] **Step 4:** `npx vitest run` dan `npm run build` → lulus. Commit `"Penyelarasan visual dengan rancangan Figma"`.
