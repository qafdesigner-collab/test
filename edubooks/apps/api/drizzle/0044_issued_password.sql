-- The password a school/super admin gave out (new account, reset, import), kept encrypted so it can be printed
-- or downloaded again. Cleared as soon as the user chooses their own password.
ALTER TABLE users ADD COLUMN IF NOT EXISTS issued_password text;
