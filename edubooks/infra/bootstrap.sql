-- Run ONCE as a PostgreSQL superuser (docker-compose does this automatically).
-- Two roles: the owner runs migrations; the app role is used at runtime and is subject to Row-Level Security.
-- CHANGE THESE PASSWORDS for any non-local environment.
CREATE ROLE edubooks LOGIN PASSWORD 'edubooks';
CREATE ROLE edubooks_app LOGIN PASSWORD 'edubooks_app' NOBYPASSRLS;
CREATE DATABASE edubooks OWNER edubooks;
CREATE DATABASE edubooks_test OWNER edubooks;
\connect edubooks
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS vector;
\connect edubooks_test
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS vector;
