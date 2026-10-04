import { pool } from "../src/config/database.js";

async function run() {
  const client = await pool.connect();
  try {
    const gldBranch = await client.query("SELECT id FROM branches WHERE code='GLD';");
    const branchId = gldBranch.rows[0].id;

    // Check with as_of = 2026-09-01
    const res = await client.query(`
      SELECT ii.sku, ii.name, ii.unit,
             bal.actual_quantity::float8 "openingStock",
             COALESCE((SELECT sum(u.quantity_consumed) FROM pos_sale_ingredient_usage u
                       JOIN pos_sale_items psi ON psi.id=u.pos_sale_item_id JOIN pos_imports pi ON pi.id=psi.pos_import_id
                       WHERE pi.branch_id=b.id AND u.inventory_item_id=ii.id
                         AND pi.business_date > '2026-09-01'::date), 0)::float8 "deductedUsage",
             (COALESCE(bal.actual_quantity, 0)
              - COALESCE((SELECT sum(u.quantity_consumed) FROM pos_sale_ingredient_usage u
                          JOIN pos_sale_items psi ON psi.id=u.pos_sale_item_id JOIN pos_imports pi ON pi.id=psi.pos_import_id
                          WHERE pi.branch_id=b.id AND u.inventory_item_id=ii.id
                            AND pi.business_date > '2026-09-01'::date), 0))::float8 "calculatedCurrentStock"
      FROM branches b
      CROSS JOIN inventory_items ii
      LEFT JOIN branch_inventory_balances bal ON bal.branch_id=b.id AND bal.inventory_item_id=ii.id AND NOT bal.is_test_data
      WHERE b.id = $1 AND ii.sku IN ('RM-001', 'RM-002', 'RM-003', 'RM-004', 'RM-005')
      ORDER BY ii.sku;
    `, [branchId]);

    console.table(res.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
