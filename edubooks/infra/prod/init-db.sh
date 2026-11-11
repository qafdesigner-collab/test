#!/bin/bash
# First start of the production database: roles with passwords from the environment, extensions.
set -euo pipefail
: "${DB_OWNER_PASSWORD:?}" "${DB_APP_PASSWORD:?}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$DB_OWNER_PASSWORD" -v app_pw="$DB_APP_PASSWORD" <<'SQL'
CREATE ROLE edubooks LOGIN PASSWORD :'owner_pw';
CREATE ROLE edubooks_app LOGIN PASSWORD :'app_pw' NOBYPASSRLS;
CREATE DATABASE edubooks OWNER edubooks;
\connect edubooks
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS vector;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
