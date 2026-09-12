import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  console.log(JSON.stringify({
    migrations: (await pool.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows.slice(-10),
    saleColumns: (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='pos_sale_items' ORDER BY ordinal_position")).rows,
    posImportConstraints: (await pool.query("SELECT conname FROM pg_constraint WHERE conrelid='pos_imports'::regclass ORDER BY conname")).rows,
    posIdentityIndexes: (await pool.query("SELECT indexname,indexdef FROM pg_indexes WHERE tablename IN ('pos_imports','pos_sale_items') AND indexname LIKE '%identity%' ORDER BY indexname")).rows,
    authenticationColumns: (await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE (table_name='users' AND column_name IN ('failed_login_attempts','locked_until')) OR table_name='auth_sessions' ORDER BY table_name,ordinal_position")).rows,
    authenticationIndexes: (await pool.query("SELECT indexname FROM pg_indexes WHERE tablename IN ('users','auth_sessions') AND (indexname LIKE '%locked_until%' OR indexname LIKE 'auth_sessions_%') ORDER BY indexname")).rows,
  }, null, 2));
} finally { await pool.end(); }
