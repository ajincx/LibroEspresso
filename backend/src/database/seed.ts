import bcrypt from "bcrypt";
import { pool } from "../config/database.js";
const branches = [["GLD", "Gulod / Main Branch", "Batangas City"], ["LPA", "Lipa", "Lipa City, Batangas"], ["VRM", "Vermosa", "Imus, Cavite"], ["TAG", "Tagaytay City", "Tagaytay City, Cavite"], ["EVO", "Evo", "Trece Martires, Cavite"]];
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "owner123";
const managerPassword = process.env.SEED_MANAGER_PASSWORD ?? "manager123";
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const [code, name, location] of branches) await client.query(`INSERT INTO branches (code,name,location) VALUES ($1,$2,$3) ON CONFLICT (code) DO UPDATE SET name=excluded.name, location=excluded.location, updated_at=now()`, [code, name, location]);
  const ownerPasswordHash = await bcrypt.hash(ownerPassword, 12);
  const managerPasswordHash = await bcrypt.hash(managerPassword, 12);
  const users = [
    { branchCode: null, firstName: "Carlos", lastName: "Mendoza", email: "owner@libro.com", username: "libro.owner", role: "OWNER", position: "Owner / System Administrator", passwordHash: ownerPasswordHash },
    { branchCode: "GLD", firstName: "Ana", lastName: "Reyes", email: "manager.gulod@libro.com", username: "manager.gulod", role: "BRANCH_MANAGER", position: "Branch Manager", passwordHash: managerPasswordHash },
    { branchCode: "LPA", firstName: "Maria", lastName: "Santos", email: "manager@libro.com", username: "libro.manager", role: "BRANCH_MANAGER", position: "Branch Manager", passwordHash: managerPasswordHash },
    { branchCode: "TAG", firstName: "Jose", lastName: "Lim", email: "manager.tagaytay@libro.com", username: "manager.tagaytay", role: "BRANCH_MANAGER", position: "Branch Manager", passwordHash: managerPasswordHash },
    { branchCode: "VRM", firstName: "Juan", lastName: "Cruz", email: "manager.vermosa@libro.com", username: "manager.vermosa", role: "BRANCH_MANAGER", position: "Branch Manager", passwordHash: managerPasswordHash },
    { branchCode: "EVO", firstName: "Rosa", lastName: "Dela Cruz", email: "manager.evo@libro.com", username: "manager.evo", role: "BRANCH_MANAGER", position: "Branch Manager", passwordHash: managerPasswordHash },
  ] as const;
  for (const user of users) {
    await client.query(
      `INSERT INTO users (branch_id,first_name,last_name,email,username,password_hash,role,position,status)
       VALUES ((SELECT id FROM branches WHERE code=$1),$2,$3,$4,$5,$6,$7,$8,'ACTIVE')
       ON CONFLICT (lower(email)) DO UPDATE SET branch_id=excluded.branch_id,first_name=excluded.first_name,last_name=excluded.last_name,
         username=excluded.username,password_hash=excluded.password_hash,role=excluded.role,position=excluded.position,status='ACTIVE',updated_at=now()`,
      [user.branchCode,user.firstName,user.lastName,user.email,user.username,user.passwordHash,user.role,user.position],
    );
  }

  const consolidateLegacyUser = async (legacyEmail: string, canonicalEmail: string) => {
    const accounts = await client.query<{ id: string; email: string }>("SELECT id,email FROM users WHERE lower(email)=ANY($1::text[])", [[legacyEmail.toLowerCase(), canonicalEmail.toLowerCase()]]);
    const legacy = accounts.rows.find((row) => row.email.toLowerCase() === legacyEmail.toLowerCase());
    const canonical = accounts.rows.find((row) => row.email.toLowerCase() === canonicalEmail.toLowerCase());
    if (!legacy || !canonical || legacy.id === canonical.id) return;
    await client.query(`DELETE FROM notifications WHERE entity_type='MESSAGE' AND entity_id IN (SELECT id FROM direct_messages WHERE (sender_user_id=$1 AND recipient_user_id=$2) OR (sender_user_id=$2 AND recipient_user_id=$1))`, [legacy.id, canonical.id]);
    await client.query(`DELETE FROM direct_messages WHERE (sender_user_id=$1 AND recipient_user_id=$2) OR (sender_user_id=$2 AND recipient_user_id=$1)`, [legacy.id, canonical.id]);
    for (const [table, column] of [["audit_logs","user_id"],["inventory_counts","submitted_by"],["inventory_movements","approved_by"],["inventory_movements","created_by"],["notifications","recipient_user_id"],["pos_imports","imported_by"],["shrinkage_reports","reviewed_by"],["shrinkage_reports","submitted_by"],["direct_messages","sender_user_id"],["direct_messages","recipient_user_id"]]) {
      await client.query(`UPDATE ${table} SET ${column}=$2 WHERE ${column}=$1`, [legacy.id, canonical.id]);
    }
    await client.query("DELETE FROM users WHERE id=$1", [legacy.id]);
  };
  await consolidateLegacyUser("owner@libro.local", "owner@libro.com");
  await consolidateLegacyUser("manager.lipa@libro.local", "manager@libro.com");
  const inventory = [
    ["RM-001", "Whole Milk", "Dairy", "ml", 0.14, 60000],
    ["RM-002", "Espresso Blend Beans", "Coffee", "g", 0.82, 25000],
    ["RM-003", "Condensed Milk", "Dairy", "ml", 0.18, 15000],
    ["RM-004", "Ice", "Supplies", "pc", 0.1, 500],
    ["RM-005", "Caramel Syrup", "Syrups", "ml", 0.32, 5000],
    ["RM-006", "Filtered Water", "Beverage Base", "ml", 0.01, 20000],
  ];
  for (const item of inventory) await client.query(`INSERT INTO inventory_items (sku,name,category,unit,unit_cost,reorder_level) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (sku) DO UPDATE SET name=excluded.name,category=excluded.category,unit=excluded.unit,unit_cost=excluded.unit_cost,reorder_level=excluded.reorder_level,updated_at=now()`, item);
  await client.query(`INSERT INTO branch_inventory_settings (branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days)
    SELECT b.id,i.id,i.unit_cost,i.reorder_level,7 FROM branches b CROSS JOIN inventory_items i
    ON CONFLICT (branch_id,inventory_item_id) DO NOTHING`);
  // Official menu products and variants are loaded separately from the approved
  // client menu. Development seeds must not recreate sample products or recipes.
  await client.query(`INSERT INTO branch_inventory_balances (branch_id,inventory_item_id,actual_quantity,as_of)
    SELECT b.id,i.id,CASE i.unit WHEN 'g' THEN 1000 WHEN 'ml' THEN 20000 ELSE 1000 END,'2026-08-25 23:59:59+08'::timestamptz
    FROM branches b CROSS JOIN inventory_items i
    ON CONFLICT (branch_id,inventory_item_id) DO NOTHING`);
  await client.query("COMMIT"); console.log("Development branches and users seeded");
} catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); await pool.end(); }
