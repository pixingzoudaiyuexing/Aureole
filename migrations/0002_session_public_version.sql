ALTER TABLE auth_sessions ADD COLUMN public_version TEXT;

UPDATE auth_sessions
SET public_version = lower(hex(randomblob(16)))
WHERE public_version IS NULL;
