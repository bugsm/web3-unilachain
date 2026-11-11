-- Up Migration
-- Skema awal backend SKPI (spec 2026-11-12 §5.1). Ledger tetap sumber kebenaran; tabel di sini hanya
-- data off-chain (akun, draft, peristiwa, pejabat) dan proyeksi aset ledger untuk daftar & pencarian nama.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id              bigserial PRIMARY KEY,
  email           text NOT NULL UNIQUE CHECK (email = lower(email)),
  nip             text UNIQUE CHECK (nip ~ '^\d{18}$'),
  nidn            text UNIQUE CHECK (nidn ~ '^\d{10}$'),
  password_hash   text NOT NULL,
  name            text NOT NULL,
  role            text NOT NULL CHECK (role IN ('admin', 'dekan', 'rektor')),
  faculty         text CHECK (faculty IN ('FEB','FH','FKIP','FP','FT','FISIP','FMIPA','FK')),
  fabric_identity text,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'rektor') = (faculty IS NULL)),
  CHECK ((role = 'admin') = (fabric_identity IS NULL))
);

CREATE TABLE drafts (
  id            bigserial PRIMARY KEY,
  type          text NOT NULL CHECK (type IN ('PENCATATAN', 'PERUBAHAN', 'PENCABUTAN')),
  status        text NOT NULL CHECK (status IN ('MENUNGGU_DEKAN', 'MENUNGGU_KONFIRMASI', 'DITOLAK_DEKAN', 'DISETUJUI', 'DIGANTIKAN')),
  npm           char(10) NOT NULL,
  faculty_code  text NOT NULL,
  data          jsonb,
  reason        text,
  reject_reason text,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL
);
CREATE INDEX drafts_npm_idx ON drafts (npm);
CREATE INDEX drafts_pending_idx ON drafts (faculty_code, updated_at) WHERE status IN ('MENUNGGU_DEKAN', 'MENUNGGU_KONFIRMASI');
-- Satu draft aktif per NPM.
CREATE UNIQUE INDEX drafts_one_active_idx ON drafts (npm) WHERE status IN ('MENUNGGU_DEKAN', 'MENUNGGU_KONFIRMASI');

CREATE TABLE events (
  id      bigserial PRIMARY KEY,
  npm     char(10) NOT NULL,
  kind    text NOT NULL CHECK (kind IN ('ledger', 'offchain')),
  action  text NOT NULL,
  at      timestamptz NOT NULL,
  actor   text NOT NULL,
  tx_id   text,
  note    text,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX events_npm_idx ON events (npm, at);
CREATE INDEX events_at_idx ON events (at DESC);

CREATE TABLE ledger_assets (
  npm          char(10) PRIMARY KEY,
  name         text NOT NULL,
  status       text NOT NULL,
  faculty_code text NOT NULL,
  skpi_id      text NOT NULL,
  data         jsonb NOT NULL,
  synced_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_assets_name_trgm_idx ON ledger_assets USING gin (lower(name) gin_trgm_ops);
CREATE INDEX ledger_assets_faculty_idx ON ledger_assets (faculty_code);

CREATE TABLE ledger_tx (
  tx_id      text PRIMARY KEY,
  draft_id   bigint REFERENCES drafts (id),
  npm        char(10) NOT NULL,
  fn         text NOT NULL,
  identity   text NOT NULL,
  status     text NOT NULL CHECK (status IN ('PENDING', 'COMMITTED', 'FAILED')),
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_tx_pending_idx ON ledger_tx (created_at) WHERE status = 'PENDING';

CREATE TABLE official_periods (
  id        bigserial PRIMARY KEY,
  office    text NOT NULL CHECK (office IN ('REKTOR','FEB','FH','FKIP','FP','FT','FISIP','FMIPA','FK')),
  name      text NOT NULL,
  from_date date NOT NULL,
  to_date   date,
  CHECK (to_date IS NULL OR to_date >= from_date)
);
CREATE UNIQUE INDEX official_periods_current_idx ON official_periods (office) WHERE to_date IS NULL;

CREATE TABLE official_changes (
  id     bigserial PRIMARY KEY,
  office text NOT NULL,
  kind   text NOT NULL CHECK (kind IN ('KOREKSI', 'PERGANTIAN')),
  before text NOT NULL,
  after  text NOT NULL,
  by_actor text NOT NULL,
  at     timestamptz NOT NULL
);

-- Data awal pejabat (spec pejabat §3; tanggal mulai 2023-01-01 hanya contoh). Dipanggil migrasi dan reset test.
CREATE FUNCTION seed_officials() RETURNS void LANGUAGE sql AS $$
  INSERT INTO official_periods (office, name, from_date)
  SELECT v.office, v.name, DATE '2023-01-01'
  FROM (VALUES
    ('REKTOR', 'Prof. Dr. Ir. Lusmeilia Afriani, D.E.A., IPM., ASEAN Eng.'),
    ('FEB', 'Prof. Dr. Nairobi, S.E., M.Si.'),
    ('FH', 'Dr. Muhammad Fakih, S.H., M.S.'),
    ('FKIP', 'Dr. Albet Maydiantoro, S.Pd., M.Pd.'),
    ('FP', 'Dr. Ir. Kuswanta Futas Hidayat, M.P.'),
    ('FT', 'Dr. Hi. Ahmad Herison, S.T., M.T.'),
    ('FISIP', 'Prof. Dr. Anna Gustina Zainal, S.Sos., M.Si.'),
    ('FMIPA', 'Dr. Eng. Heri Satria, S.Si., M.Si.'),
    ('FK', 'Dr. dr. Evi Kurniawaty, M.Sc.')
  ) AS v(office, name)
  WHERE NOT EXISTS (SELECT 1 FROM official_periods p WHERE p.office = v.office);
$$;
SELECT seed_officials();

-- Down Migration
DROP FUNCTION IF EXISTS seed_officials();
DROP TABLE IF EXISTS official_changes, official_periods, ledger_tx, ledger_assets, events, drafts, users;
