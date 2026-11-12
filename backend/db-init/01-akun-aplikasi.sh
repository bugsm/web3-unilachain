#!/bin/sh
# Dijalankan sekali oleh image postgres saat volume masih kosong.
# Aplikasi memakai akun pemilik basis data yang BUKAN superuser (CLAUDE.md §2).
# Nama dan sandi dilewatkan sebagai variabel psql (dikutip oleh psql), sehingga tanda kutip/simbol dalam sandi aman.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_pw="$APP_DB_PASSWORD" -v db="$POSTGRES_DB" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE :"db" OWNER TO :"app_user";
ALTER SCHEMA public OWNER TO :"app_user";
SQL
