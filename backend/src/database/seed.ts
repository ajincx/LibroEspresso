import bcrypt from "bcrypt";
import { pool } from "../config/database.js";
const branches = [["GLD", "Gulod / Main Branch", "Batangas City"], ["LPA", "Lipa", "Lipa City, Batangas"], ["VRM", "Vermosa", "Imus, Cavite"], ["TAG", "Tagaytay City", "Tagaytay City, Cavite"], ["EVO", "Evo", "Trece Martires, Cavite"]];
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "LibroOwner2026!";
const managerPassword = process.env.SEED_MANAGER_PASSWORD ?? "LibroManager2026!";
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const [code, name, location] of branches) await client.query(`INSERT INTO branches (code,name,location) VALUES ($1,$2,$3) ON CONFLICT (code) DO UPDATE SET name=excluded.name, location=excluded.location, updated_at=now()`, [code, name, location]);
  const lipa = await client.query<{ id: string }>("SELECT id FROM branches WHERE code='LPA'");
  await client.query(`INSERT INTO users (first_name,last_name,email,username,password_hash,role) VALUES ('Carlos','Mendoza','owner@libro.local','owner',$1,'OWNER') ON CONFLICT (lower(email)) DO UPDATE SET password_hash=excluded.password_hash,status='ACTIVE',updated_at=now()`, [await bcrypt.hash(ownerPassword, 12)]);
  await client.query(`INSERT INTO users (branch_id,first_name,last_name,email,username,password_hash,role) VALUES ($1,'Maria','Santos','manager.lipa@libro.local','manager.lipa',$2,'BRANCH_MANAGER') ON CONFLICT (lower(email)) DO UPDATE SET branch_id=excluded.branch_id,password_hash=excluded.password_hash,status='ACTIVE',updated_at=now()`, [lipa.rows[0]!.id, await bcrypt.hash(managerPassword, 12)]);
  await client.query(`INSERT INTO users (first_name,last_name,email,username,password_hash,role) VALUES ('Libro','Owner','owner@libro.com','libro.owner',$1,'OWNER') ON CONFLICT (lower(email)) DO UPDATE SET branch_id=NULL,password_hash=excluded.password_hash,role='OWNER',status='ACTIVE',updated_at=now()`, [await bcrypt.hash("owner123", 12)]);
  await client.query(`INSERT INTO users (branch_id,first_name,last_name,email,username,password_hash,role) VALUES ($1,'Libro','Manager','manager@libro.com','libro.manager',$2,'BRANCH_MANAGER') ON CONFLICT (lower(email)) DO UPDATE SET branch_id=excluded.branch_id,password_hash=excluded.password_hash,role='BRANCH_MANAGER',status='ACTIVE',updated_at=now()`, [lipa.rows[0]!.id, await bcrypt.hash("manager123", 12)]);
  const inventory = [
    ["RM-001", "Whole Milk", "Dairy", "ml", 0.14, 60000],
    ["RM-002", "Espresso Blend Beans", "Coffee", "g", 0.82, 25000],
    ["RM-003", "Condensed Milk", "Dairy", "ml", 0.18, 15000],
    ["RM-004", "Ice", "Supplies", "piece", 0.1, 500],
    ["RM-005", "Caramel Syrup", "Syrups", "ml", 0.32, 5000],
    ["RM-006", "Filtered Water", "Beverage Base", "ml", 0.01, 20000],
  ];
  for (const item of inventory) await client.query(`INSERT INTO inventory_items (sku,name,category,unit,unit_cost,reorder_level) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (sku) DO UPDATE SET name=excluded.name,category=excluded.category,unit=excluded.unit,unit_cost=excluded.unit_cost,reorder_level=excluded.reorder_level,updated_at=now()`, item);
  const menuDefinitions = [
    { code: "BEV-CM", name: "Caramel Macchiato", price: 175, ingredients: [["RM-002", 18, "g"], ["RM-001", 180, "ml"], ["RM-005", 20, "ml"], ["RM-004", 1, "piece"]] },
    { code: "BEV-ISL", name: "Spanish Latte", price: 165, ingredients: [["RM-002", 18, "g"], ["RM-001", 180, "ml"], ["RM-003", 30, "ml"], ["RM-004", 1, "piece"]] },
    { code: "BEV-AM", name: "Americano", price: 120, ingredients: [["RM-002", 18, "g"], ["RM-006", 220, "ml"]] },
    { code: "BEV-CP", name: "Cappuccino", price: 145, ingredients: [["RM-002", 18, "g"], ["RM-001", 150, "ml"]] },
  ];
  for (const definition of menuDefinitions) {
    const menu = await client.query<{ id: string }>(`INSERT INTO menu_items (code,name,category_id,category,selling_price,description) SELECT $1,$2,id,name,$3,$4 FROM menu_categories WHERE lower(name)='coffee' ON CONFLICT (code) DO UPDATE SET name=excluded.name,category_id=excluded.category_id,category=excluded.category,selling_price=excluded.selling_price,description=excluded.description,updated_at=now() RETURNING id`, [definition.code, definition.name, definition.price, `${definition.name} prepared using the Libro Espresso standard recipe.`]);
    const recipe = await client.query<{ id: string }>(`INSERT INTO recipes (menu_item_id,name,yield_quantity) VALUES ($1,$2,1) ON CONFLICT (menu_item_id) DO UPDATE SET name=excluded.name,yield_quantity=excluded.yield_quantity,updated_at=now() RETURNING id`, [menu.rows[0]!.id, `Standard ${definition.name}`]);
    for (const [sku, quantity, unit] of definition.ingredients) await client.query(`INSERT INTO recipe_items (recipe_id,inventory_item_id,quantity,unit) SELECT $1,id,$3,$4 FROM inventory_items WHERE sku=$2 ON CONFLICT (recipe_id,inventory_item_id) DO UPDATE SET quantity=excluded.quantity,unit=excluded.unit,updated_at=now()`, [recipe.rows[0]!.id, sku, quantity, unit]);
  }
  await client.query(`INSERT INTO branch_inventory_balances (branch_id,inventory_item_id,actual_quantity,as_of)
    SELECT b.id,i.id,CASE i.unit WHEN 'g' THEN 1000 WHEN 'ml' THEN 20000 ELSE 1000 END,'2026-08-25 23:59:59+08'::timestamptz
    FROM branches b CROSS JOIN inventory_items i
    ON CONFLICT (branch_id,inventory_item_id) DO NOTHING`);
  await client.query("COMMIT"); console.log("Development branches and users seeded");
} catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); await pool.end(); }
