# Pejabat Penanda Tangan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin fakultas dapat mengelola nama rektor dan dekan per periode jabatan lewat UI (`/pejabat`), dengan log perubahan, dan hasil verifikasi publik menampilkan nama dekan + rektor sesuai waktu pengesahan.

**Architecture:** Aturan periode murni di `src/domain/officials.ts`; mock store menyimpan periode + log dan memakai aturan itu; `ApiClient` mendapat 4 metode baru; layar baru `OfficialsScreen` memakai Modal/Drawer yang sudah ada.

**Tech Stack:** sama dengan frontend S5 (React 19, Vite, Tailwind v4, Vitest + RTL).

**Spec:** `offchain/docs/superpowers/specs/2026-11-11-pejabat-penanda-tangan-design.md` (induk: `2026-11-10-frontend-skpi-design.md`)

## Global Constraints

- Path relatif ke `offchain/`; test dijalankan dari `C:\laragon\www\blockchain\offchain\frontend` (huruf drive besar) dengan `npx vitest run`.
- Branch `feat/frontend-s5` (lanjutan; belum di-merge). Pesan commit Bahasa Indonesia.
- Jabatan: `REKTOR` + `FEB, FH, FKIP, FP, FT, FISIP, FMIPA, FK`.
- Rektor: diubah admin fakultas mana pun. Dekan: hanya admin fakultas yang sama. Dekan/rektor: baca saja.
- Koreksi = ganti nama satu periode, tanggal tetap. Pergantian = tutup periode berjalan (`to` = sehari sebelum `from` baru) + buka periode baru; `from` baru > `from` periode berjalan dan ≤ hari ini (WIB).
- Nama: 3–150 karakter setelah trim (spasi ganda dirapikan), tanpa `[\u0000-\u001f\u007f]`.
- Pemilihan nama: rektor ← `rektorTimestamp`, dekan ← `issuedTimestamp` + fakultas SKPI; tanggal dihitung dalam WIB; tanpa periode cocok → `null`.
- Data awal (mock), semua `from: "2023-01-01"`, `to: null`: Rektor "Prof. Dr. Ir. Lusmeilia Afriani, D.E.A., IPM., ASEAN Eng."; FEB "Prof. Dr. Nairobi, S.E., M.Si."; FH "Dr. Muhammad Fakih, S.H., M.S."; FKIP "Dr. Albet Maydiantoro, S.Pd., M.Pd."; FP "Dr. Ir. Kuswanta Futas Hidayat, M.P."; FT "Dr. Hi. Ahmad Herison, S.T., M.T."; FISIP "Prof. Dr. Anna Gustina Zainal, S.Sos., M.Si."; FMIPA "Dr. Eng. Heri Satria, S.Si., M.Si."; FK "Dr. dr. Evi Kurniawaty, M.Sc.".
- Galat API: 400 validasi, 403 di luar wewenang, 409 tanggal pergantian tidak sah.

## Review Focus

1. **SKPI disahkan tepat di hari pergantian** — memakai nama pejabat baru; sehari sebelumnya memakai pejabat lama (Task 1 test `nameAt` batas).
2. **Timestamp UTC yang jatuh di hari berbeda di WIB** (mis. `2026-06-30T18:00:00Z` = 1 Juli WIB) — hari WIB yang dipakai (Task 1).
3. **Admin fakultas lain memanggil API dekan fakultas lain** — 403 walau UI menyembunyikan tombol (Task 1 mock test).
4. **Koreksi periode lama yang sudah ditutup** — diizinkan, tercatat, dan verifikasi SKPI lama ikut nama terkoreksi (Task 1).
5. **Pergantian bertanggal sama dengan mulai periode berjalan atau di masa depan** — ditolak 409, UI menampilkan pesannya (Task 1, Task 2).

---

### Task 1: Domain, kontrak API, mock, dan klien HTTP

**Files:**
- Create: `frontend/src/domain/officials.ts`, `frontend/src/domain/officials.test.ts`
- Modify: `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/api/httpClient.ts`, `frontend/src/api/httpClient.test.ts`, `frontend/src/api/mock/store.ts` (atau file baru `mock/officials.ts`), `frontend/src/api/mock/mockClient.ts`, `frontend/src/api/mock/mockClient.test.ts`

**Interfaces — Produces:**
- `types.ts`: `type Office = "REKTOR" | FacultyCode`; `interface OfficialPeriod { id: string; name: string; from: string; to: string | null }` (tanggal `YYYY-MM-DD`); `interface OfficialChange { id: string; office: Office; kind: "KOREKSI" | "PERGANTIAN"; before: string; after: string; by: string; at: string }`; `interface Official { office: Office; periods: OfficialPeriod[]; lastChange: OfficialChange | null }` (periode urut lama → baru); `VerifyResult` ditambah `dekanName: string | null`.
- `ApiClient`: `listOfficials(): Promise<Official[]>` (urut REKTOR lalu urutan `FACULTIES`), `officialChanges(office: Office): Promise<OfficialChange[]>` (terbaru dulu), `correctOfficial(office: Office, periodId: string, name: string): Promise<Official>`, `replaceOfficial(office: Office, name: string, from: string): Promise<Official>`.
- `domain/officials.ts`: `wibDate(iso: string): string`, `nameAt(periods: OfficialPeriod[], iso: string): string | null`, `normalizeOfficialName(v: string): string`, `validateOfficialName(v: string): string | undefined`, `validateSuccession(periods: OfficialPeriod[], from: string, today: string): string | undefined`, `canEditOffice(user: User, office: Office): boolean`, `OFFICE_LABEL(office: Office): string` ("Rektor" / "Dekan FMIPA"), `INITIAL_OFFICIALS` (data awal Global Constraints).
- HTTP: `GET /api/officials`, `GET /api/officials/changes?office=`, `POST /api/officials/:office/corrections {periodId,name}`, `POST /api/officials/:office/successions {name,from}` — respons mentah sesuai tipe.

- [ ] **Step 1: Tulis test gagal `officials.test.ts`:**
  - `wibDate("2026-06-30T18:00:00Z") === "2026-07-01"`.
  - Periode `[{from:"2023-01-01",to:"2026-06-30",name:"A"},{from:"2026-07-01",to:null,name:"B"}]`: `nameAt(…,"2026-06-30T10:00:00+07:00") === "A"`, `nameAt(…,"2026-07-01T00:00:00+07:00") === "B"`, `nameAt(…,"2022-12-31T12:00:00+07:00") === null`.
  - `validateOfficialName("  ab ")` galat; `"a".repeat(151)` galat; `"Dr. X\n"` galat; `normalizeOfficialName("  Dr.   X  ") === "Dr. X"`.
  - `validateSuccession(periods berjalan from "2023-01-01", "2023-01-01", "2026-11-11")` galat; `"2026-11-12"` (masa depan) galat; `"2026-11-11"` OK.
  - `canEditOffice(adminFMIPA,"REKTOR")` true, `(adminFMIPA,"FMIPA")` true, `(adminFMIPA,"FT")` false, `(dekanFMIPA,"FMIPA")` false.
- [ ] **Step 2: Tambah test mock** (seed default): `listOfficials()` → 9 jabatan, REKTOR berisi nama Lusmeilia; admin FT `correctOfficial("FMIPA",…)` → 403; admin FT `correctOfficial("REKTOR", id, "Prof. Lusmeilia (koreksi)")` → `lastChange` `{kind:"KOREKSI", by:"admin.ft (off-chain)", before: nama lama}`; `replaceOfficial("REKTOR","Rektor Baru", besok)` → 409; pergantian sah menutup periode lama `to` = sehari sebelumnya; `verify("2017051008")` → `dekanName` "Dr. Eng. Heri Satria, S.Si., M.Si.", `rektorName` nama rektor seed; koreksi periode lama tertutup tetap diizinkan dan `officialChanges` terurut terbaru dulu. Dekan/rektor `correctOfficial` → 403.
- [ ] **Step 3: Test httpClient:** path dan body empat endpoint di atas.
- [ ] **Step 4: Jalankan — FAIL.**
- [ ] **Step 5: Implementasi.** Hapus `REKTOR_PERIODS` di mock; verifikasi memakai `nameAt`. `now` mock dipakai untuk "hari ini" (WIB). Pesan galat: `"Nama 3–150 karakter, tanpa karakter kontrol."`, `"Tanggal mulai harus setelah ${from} dan tidak di masa depan."`, `"Anda hanya dapat mengubah Rektor dan Dekan fakultas Anda."`.
- [ ] **Step 6: Jalankan seluruh suite + `npx tsc -p tsconfig.json --noEmit` — PASS.** Commit `"Periode pejabat penanda tangan di kontrak API dan mock"`.

### Task 2: Layar Pejabat

**Files:**
- Create: `frontend/src/screens/officials/OfficialsScreen.tsx`, `OfficialModal.tsx`, `Officials.test.tsx`
- Modify: `frontend/src/components/Shell.tsx` (NAV: `{ to: "/pejabat", label: "Pejabat", icon: UserRoundPen, roles: ["admin","dekan","rektor"] }` setelah "Daftar & riwayat"), `frontend/src/app/router.tsx`

**Interfaces — Consumes:** Task 1.

- [ ] **Step 1: Tulis test gagal:**
  - Admin FMIPA di `/pejabat`: kartu Rektor (region "Rektor") memuat nama Lusmeilia dan "menjabat sejak"; tabel dekan 8 baris; tombol "Koreksi nama" dan "Catat pergantian" ada pada Rektor dan baris FMIPA, tidak ada pada baris FT.
  - Dekan FMIPA: tidak ada tombol "Koreksi nama"/"Catat pergantian"; ada teks "Nama pejabat dikelola admin fakultas."
  - Koreksi Rektor oleh admin FMIPA → modal "Koreksi nama Rektor", isi nama baru, simpan → toast "Nama Rektor dikoreksi", kartu menampilkan "terakhir diubah oleh admin.fmipa (off-chain)".
  - Pergantian Dekan FMIPA dengan tanggal = mulai periode berjalan → pesan galat 409 tampil di modal (role `alert`), modal tetap terbuka.
  - Klik "Riwayat" pada Rektor → drawer "Riwayat Rektor" berisi daftar periode dan perubahan (`KOREKSI`, sebelum → sesudah, oleh, waktu).
  - Klik ganda "Simpan" → `correctOfficial` dipanggil sekali.
- [ ] **Step 2: Jalankan — FAIL.**
- [ ] **Step 3: Implementasi** mengikuti gaya `RegistryScreen` (PageHeader eyebrow "Penanda tangan", judul "Pejabat", deskripsi menjelaskan bahwa nama dipilih menurut waktu pengesahan dan SKPI lama tetap memakai pejabat lamanya). Modal: Field "Nama & gelar lengkap" (+ Field "Tanggal mulai menjabat" `type="date"` `max` hari ini untuk pergantian), validasi Task 1 di sisi klien, `Button loading`. Tanpa animasi pada tabel.
- [ ] **Step 4: Jalankan seluruh suite + tsc — PASS.** Commit `"Layar pejabat: koreksi dan pergantian rektor/dekan dengan riwayat"`.

### Task 3: Nama dekan di hasil verifikasi

**Files:** Modify `frontend/src/screens/verify/VerifyResult.tsx`, `frontend/src/screens/verify/Verify.test.tsx`

- [ ] **Step 1: Test gagal:** `/verifikasi/2017051008` → region "Penanda tangan" memuat "Dr. Eng. Heri Satria, S.Si., M.Si." dan "Prof. Dr. Ir. Lusmeilia Afriani"; bila `dekanName` null (stub `verify`) tetap menampilkan `issuer` tanpa galat.
- [ ] **Step 2: FAIL. Step 3:** "Tahap 1 · Dekan" menampilkan `dekanName` (bila ada) di atas `issuer`; teks catatan diganti "Nama pejabat diambil dari tabel periode jabatan berdasarkan waktu pengesahan." **Step 4:** suite + tsc PASS, commit `"Nama dekan pada hasil verifikasi publik"`.
