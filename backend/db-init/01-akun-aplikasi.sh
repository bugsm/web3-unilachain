#!/bin/sh
# Dijalankan sekali oleh image postgres saat volume masih kosong.
# Aplikasi memakai akun pemilik basis data yang BUKAN superuser (CLAUDE.md §2).
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE ${APP_DB_USER} LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE ${POSTGRES_DB} OWNER TO ${APP_DB_USER};
ALTER SCHEMA public OWNER TO ${APP_DB_USER};
SQL
