BEGIN;
DELETE FROM schema_migrations WHERE filename='062_pos_import_email_reminders.sql';
DROP TABLE IF EXISTS pos_import_email_reminders;
COMMIT;
