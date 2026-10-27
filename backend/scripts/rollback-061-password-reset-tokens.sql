BEGIN;
DELETE FROM schema_migrations WHERE filename='061_password_reset_tokens.sql';
DROP TABLE IF EXISTS password_reset_tokens;
COMMIT;
