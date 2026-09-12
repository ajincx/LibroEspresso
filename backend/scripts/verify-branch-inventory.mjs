import "dotenv/config";
import pg from "pg";
import jwt from "jsonwebtoken";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const coverage = await pool.query(`SELECT
    (SELECT count(*)::int FROM branch_inventory_settings) settings,
    (SELECT count(*)::int FROM branches CROSS JOIN inventory_items) expected`);
  const users = await pool.query(`SELECT u.id,u.role,u.branch_id "branchId",b.code,b.name "branchName"
    FROM users u LEFT JOIN branches b ON b.id=u.branch_id
    WHERE u.status='ACTIVE' AND (u.role='OWNER' OR (u.role='BRANCH_MANAGER' AND b.code='GLD'))`);
  const owner = users.rows.find((user) => user.role === "OWNER");
  const manager = users.rows.find((user) => user.role === "BRANCH_MANAGER");
  const cookieName = process.env.COOKIE_NAME || "libro_session";
  const session = (user) => ({ Cookie: `${cookieName}=${jwt.sign({ id:user.id,role:user.role,branchId:user.branchId },process.env.JWT_SECRET,{expiresIn:"5m"})}` });
  const branches = await pool.query(`SELECT id FROM branches WHERE code='LPA'`);
  const managerInventory = await (await fetch(`http://localhost:5000/api/inventory-overview?branchId=${branches.rows[0].id}`, { headers: session(manager) })).json();
  const ownerInventory = await (await fetch("http://localhost:5000/api/inventory-overview", { headers: session(owner) })).json();
  const recipes = await (await fetch("http://localhost:5000/api/menu-items/with-recipes", { headers: session(manager) })).json();
  console.log(JSON.stringify({
    settingsCoverage: coverage.rows[0],
    managerAccountBranch: manager.branchName,
    managerInventoryBranches: [...new Set((managerInventory.data?.items || []).map((item) => item.branchName))],
    ownerInventoryBranches: [...new Set((ownerInventory.data?.items || []).map((item) => item.branchName))],
    managerRecipeCount: recipes.data?.products?.length,
    errors: [managerInventory.error,ownerInventory.error,recipes.error].filter(Boolean),
  }, null, 2));
} finally { await pool.end(); }
