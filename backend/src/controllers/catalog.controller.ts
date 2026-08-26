import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { writeAudit } from "../services/audit.service.js";
import { AppError } from "../utils/appError.js";
import { idParams, inventoryItemInput, inventoryItemPatch, menuCategoryInput, menuCategoryPatch, menuItemInput, menuItemPatch, menuProductInput, recipeInput } from "../validators/masterData.js";

const inventorySelection = `SELECT id,sku,name,category,unit,unit_cost::float8 "unitCost",reorder_level::float8 "reorderLevel",status,created_at "createdAt",updated_at "updatedAt" FROM inventory_items`;
export const listInventoryItems: RequestHandler = async (_req,res) => { const result=await pool.query(`${inventorySelection} ORDER BY name`); res.json({success:true,data:{items:result.rows}}); };
export const getInventoryItem: RequestHandler = async (req,res) => { const {id}=idParams.parse(req.params); const result=await pool.query(`${inventorySelection} WHERE id=$1`,[id]); if(!result.rows[0]) throw new AppError(404,"INVENTORY_ITEM_NOT_FOUND","Inventory item not found"); res.json({success:true,data:{item:result.rows[0]}}); };
export const createInventoryItem: RequestHandler = async (req,res) => { const v=inventoryItemInput.parse(req.body); const result=await pool.query(`INSERT INTO inventory_items (sku,name,category,unit,unit_cost,reorder_level,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,sku,name,category,unit,unit_cost::float8 "unitCost",reorder_level::float8 "reorderLevel",status,created_at "createdAt",updated_at "updatedAt"`,[v.sku,v.name,v.category,v.unit,v.unitCost,v.reorderLevel,v.status]); await writeAudit(req.user!,"CREATE_INVENTORY_ITEM","INVENTORY_ITEM",result.rows[0].id,`Created inventory item ${v.name}`); res.status(201).json({success:true,data:{item:result.rows[0]}}); };
export const updateInventoryItem: RequestHandler = async (req,res) => { const {id}=idParams.parse(req.params); const v=inventoryItemPatch.parse(req.body); const result=await pool.query(`UPDATE inventory_items SET sku=COALESCE($2,sku),name=COALESCE($3,name),category=COALESCE($4,category),unit=COALESCE($5,unit),unit_cost=COALESCE($6,unit_cost),reorder_level=COALESCE($7,reorder_level),status=COALESCE($8,status),updated_at=now() WHERE id=$1 RETURNING id,sku,name,category,unit,unit_cost::float8 "unitCost",reorder_level::float8 "reorderLevel",status,created_at "createdAt",updated_at "updatedAt"`,[id,v.sku??null,v.name??null,v.category??null,v.unit??null,v.unitCost??null,v.reorderLevel??null,v.status??null]); if(!result.rows[0]) throw new AppError(404,"INVENTORY_ITEM_NOT_FOUND","Inventory item not found"); await writeAudit(req.user!,"UPDATE_INVENTORY_ITEM","INVENTORY_ITEM",id,`Updated inventory item ${result.rows[0].name}`,{fields:Object.keys(v)}); res.json({success:true,data:{item:result.rows[0]}}); };

const menuSelection = `SELECT id,code,name,category,selling_price::float8 "sellingPrice",status,created_at "createdAt",updated_at "updatedAt" FROM menu_items`;
export const listMenuItems: RequestHandler = async (_req,res) => { const result=await pool.query(`${menuSelection} ORDER BY name`); res.json({success:true,data:{items:result.rows}}); };
export const getMenuItem: RequestHandler = async (req,res) => { const {id}=idParams.parse(req.params); const result=await pool.query(`${menuSelection} WHERE id=$1`,[id]); if(!result.rows[0]) throw new AppError(404,"MENU_ITEM_NOT_FOUND","Menu item not found"); res.json({success:true,data:{item:result.rows[0]}}); };
export const createMenuItem: RequestHandler = async (req,res) => { const v=menuItemInput.parse(req.body); const result=await pool.query(`INSERT INTO menu_items (code,name,category,selling_price,status) VALUES ($1,$2,$3,$4,$5) RETURNING id,code,name,category,selling_price::float8 "sellingPrice",status,created_at "createdAt",updated_at "updatedAt"`,[v.code,v.name,v.category,v.sellingPrice,v.status]); await writeAudit(req.user!,"CREATE_MENU_ITEM","MENU_ITEM",result.rows[0].id,`Created menu item ${v.name}`); res.status(201).json({success:true,data:{item:result.rows[0]}}); };
export const updateMenuItem: RequestHandler = async (req,res) => { const {id}=idParams.parse(req.params); const v=menuItemPatch.parse(req.body); const result=await pool.query(`UPDATE menu_items SET code=COALESCE($2,code),name=COALESCE($3,name),category=COALESCE($4,category),selling_price=COALESCE($5,selling_price),status=COALESCE($6,status),updated_at=now() WHERE id=$1 RETURNING id,code,name,category,selling_price::float8 "sellingPrice",status,created_at "createdAt",updated_at "updatedAt"`,[id,v.code??null,v.name??null,v.category??null,v.sellingPrice??null,v.status??null]); if(!result.rows[0]) throw new AppError(404,"MENU_ITEM_NOT_FOUND","Menu item not found"); await writeAudit(req.user!,"UPDATE_MENU_ITEM","MENU_ITEM",id,`Updated menu item ${result.rows[0].name}`,{fields:Object.keys(v)}); res.json({success:true,data:{item:result.rows[0]}}); };

async function readRecipe(id?: string) {
  const values=id?[id]:[]; const where=id?"WHERE r.id=$1":"";
  const result=await pool.query(`SELECT r.id,r.menu_item_id "menuItemId",r.name,r.yield_quantity::float8 "yieldQuantity",r.status,r.created_at "createdAt",r.updated_at "updatedAt",json_build_object('id',m.id,'code',m.code,'name',m.name,'sellingPrice',m.selling_price::float8) "menuItem",COALESCE(json_agg(json_build_object('id',ri.id,'inventoryItemId',i.id,'sku',i.sku,'name',i.name,'quantity',ri.quantity::float8,'unit',ri.unit,'unitCost',i.unit_cost::float8)) FILTER (WHERE ri.id IS NOT NULL),'[]') items FROM recipes r JOIN menu_items m ON m.id=r.menu_item_id LEFT JOIN recipe_items ri ON ri.recipe_id=r.id LEFT JOIN inventory_items i ON i.id=ri.inventory_item_id ${where} GROUP BY r.id,m.id ORDER BY r.name`,values); return result.rows;
}
export const listRecipes: RequestHandler=async(_req,res)=>res.json({success:true,data:{recipes:await readRecipe()}});
export const getRecipe: RequestHandler=async(req,res)=>{const{id}=idParams.parse(req.params);const recipe=(await readRecipe(id))[0];if(!recipe)throw new AppError(404,"RECIPE_NOT_FOUND","Recipe not found");res.json({success:true,data:{recipe}});};
async function saveRecipe(req: Parameters<RequestHandler>[0], id?: string) {
  const v=recipeInput.parse(req.body); const client=await pool.connect();
  try { await client.query("BEGIN"); let recipeId=id;
    if(id){const updated=await client.query(`UPDATE recipes SET menu_item_id=$2,name=$3,yield_quantity=$4,status=$5,updated_at=now() WHERE id=$1 RETURNING id`,[id,v.menuItemId,v.name,v.yieldQuantity,v.status]);if(!updated.rows[0])throw new AppError(404,"RECIPE_NOT_FOUND","Recipe not found");await client.query("DELETE FROM recipe_items WHERE recipe_id=$1",[id]);}
    else {const inserted=await client.query<{id:string}>(`INSERT INTO recipes (menu_item_id,name,yield_quantity,status) VALUES ($1,$2,$3,$4) RETURNING id`,[v.menuItemId,v.name,v.yieldQuantity,v.status]);recipeId=inserted.rows[0]!.id;}
    for(const item of v.items) await client.query(`INSERT INTO recipe_items (recipe_id,inventory_item_id,quantity,unit) VALUES ($1,$2,$3,$4)`,[recipeId,item.inventoryItemId,item.quantity,item.unit]);
    await writeAudit(req.user!,id?"UPDATE_RECIPE":"CREATE_RECIPE","RECIPE",recipeId!,`${id?"Updated":"Created"} recipe ${v.name}`,{ingredientCount:v.items.length},client); await client.query("COMMIT"); return recipeId!;
  } catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export const createRecipe: RequestHandler=async(req,res)=>{const id=await saveRecipe(req);res.status(201).json({success:true,data:{recipe:(await readRecipe(id))[0]}});};
export const updateRecipe: RequestHandler=async(req,res)=>{const{id}=idParams.parse(req.params);await saveRecipe(req,id);res.json({success:true,data:{recipe:(await readRecipe(id))[0]}});};

const categorySelection = `SELECT id,name,description,status,created_at "createdAt",updated_at "updatedAt" FROM menu_categories`;
export const listMenuCategories: RequestHandler = async (_req, res) => {
  const result = await pool.query(`${categorySelection} ORDER BY CASE WHEN name='Others' THEN 1 ELSE 0 END,name`);
  res.json({ success: true, data: { categories: result.rows } });
};
export const createMenuCategory: RequestHandler = async (req, res) => {
  const value = menuCategoryInput.parse(req.body);
  const inserted = await pool.query(
    `INSERT INTO menu_categories (name,description,status) VALUES ($1,$2,$3)
     RETURNING id,name,description,status,created_at "createdAt",updated_at "updatedAt"`,
    [value.name, value.description, value.status],
  );
  await writeAudit(req.user!, "CREATE_MENU_CATEGORY", "MENU_CATEGORY", inserted.rows[0].id, `Created menu category ${value.name}`);
  res.status(201).json({ success: true, data: { category: inserted.rows[0] } });
};
export const updateMenuCategory: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const value = menuCategoryPatch.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE menu_categories SET name=COALESCE($2,name),description=COALESCE($3,description),status=COALESCE($4,status),updated_at=now()
       WHERE id=$1 RETURNING id,name,description,status,created_at "createdAt",updated_at "updatedAt"`,
      [id, value.name ?? null, value.description ?? null, value.status ?? null],
    );
    if (!updated.rows[0]) throw new AppError(404, "MENU_CATEGORY_NOT_FOUND", "Menu category not found");
    if (value.name) await client.query(`UPDATE menu_items SET category=$2,updated_at=now() WHERE category_id=$1`, [id, value.name]);
    await writeAudit(req.user!, "UPDATE_MENU_CATEGORY", "MENU_CATEGORY", id, `Updated menu category ${updated.rows[0].name}`, { fields: Object.keys(value) }, client);
    await client.query("COMMIT");
    res.json({ success: true, data: { category: updated.rows[0] } });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
};

async function readMenuProducts(id?: string) {
  const where = id ? "WHERE m.id=$1" : "";
  const result = await pool.query(
    `SELECT m.id,m.code,m.name,COALESCE(c.name,m.category) category,c.id "categoryId",m.description,
            m.selling_price::float8 "sellingPrice",m.status,m.created_at "createdAt",m.updated_at "updatedAt",
            r.id "recipeId",r.name "recipeName",r.yield_quantity::float8 "yieldQuantity",
            COALESCE(sum(ri.quantity*ii.unit_cost)/NULLIF(r.yield_quantity,0),0)::float8 "recipeCost",
            (m.selling_price-COALESCE(sum(ri.quantity*ii.unit_cost)/NULLIF(r.yield_quantity,0),0))::float8 "marginAmount",
            CASE WHEN m.selling_price>0 THEN ((m.selling_price-COALESCE(sum(ri.quantity*ii.unit_cost)/NULLIF(r.yield_quantity,0),0))/m.selling_price*100)::float8 ELSE 0 END "marginRate",
            COALESCE(json_agg(json_build_object('id',ri.id,'inventoryItemId',ii.id,'sku',ii.sku,'name',ii.name,
              'quantity',ri.quantity::float8,'unit',ri.unit,'unitCost',ii.unit_cost::float8,
              'ingredientCost',(ri.quantity*ii.unit_cost/NULLIF(r.yield_quantity,0))::float8)
              ORDER BY ii.name) FILTER (WHERE ri.id IS NOT NULL),'[]') ingredients
       FROM menu_items m
       LEFT JOIN menu_categories c ON c.id=m.category_id
       LEFT JOIN recipes r ON r.menu_item_id=m.id
       LEFT JOIN recipe_items ri ON ri.recipe_id=r.id
       LEFT JOIN inventory_items ii ON ii.id=ri.inventory_item_id
       ${where}
      GROUP BY m.id,c.id,r.id
      ORDER BY m.name`,
    id ? [id] : [],
  );
  return result.rows;
}

export const listMenuProducts: RequestHandler = async (_req, res) => res.json({ success: true, data: { products: await readMenuProducts() } });
export const getMenuProduct: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const product = (await readMenuProducts(id))[0];
  if (!product) throw new AppError(404, "MENU_PRODUCT_NOT_FOUND", "Menu product not found");
  res.json({ success: true, data: { product } });
};

async function saveMenuProduct(req: Parameters<RequestHandler>[0], productId?: string) {
  const value = menuProductInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const category = await client.query<{ name: string }>(`SELECT name FROM menu_categories WHERE id=$1`, [value.categoryId]);
    if (!category.rows[0]) throw new AppError(422, "MENU_CATEGORY_INVALID", "Select a valid menu category");
    const ingredientIds = value.recipe.items.map((item) => item.inventoryItemId);
    const ingredients = await client.query<{ id: string; name: string; unit: string }>(`SELECT id,name,unit FROM inventory_items WHERE id=ANY($1::uuid[]) AND status='ACTIVE'`, [ingredientIds]);
    if (ingredients.rows.length !== ingredientIds.length) throw new AppError(422, "RECIPE_INGREDIENT_INVALID", "One or more inventory ingredients are missing or inactive");
    for (const item of value.recipe.items) {
      const ingredient = ingredients.rows.find((candidate) => candidate.id === item.inventoryItemId)!;
      if (ingredient.unit.toLowerCase() !== item.unit.toLowerCase()) throw new AppError(422, "RECIPE_UNIT_MISMATCH", `${ingredient.name} must use ${ingredient.unit}`);
    }

    let savedProductId = productId;
    if (productId) {
      const updated = await client.query(
        `UPDATE menu_items SET code=$2,name=$3,category_id=$4,category=$5,selling_price=$6,description=$7,status=$8,updated_at=now() WHERE id=$1 RETURNING id`,
        [productId, value.code, value.name, value.categoryId, category.rows[0].name, value.sellingPrice, value.description, value.status],
      );
      if (!updated.rows[0]) throw new AppError(404, "MENU_PRODUCT_NOT_FOUND", "Menu product not found");
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO menu_items (code,name,category_id,category,selling_price,description,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [value.code, value.name, value.categoryId, category.rows[0].name, value.sellingPrice, value.description, value.status],
      );
      savedProductId = inserted.rows[0]!.id;
    }

    const existingRecipe = await client.query<{ id: string }>(`SELECT id FROM recipes WHERE menu_item_id=$1`, [savedProductId]);
    let recipeId = existingRecipe.rows[0]?.id;
    if (recipeId) {
      await client.query(`UPDATE recipes SET name=$2,yield_quantity=$3,status=$4,updated_at=now() WHERE id=$1`, [recipeId, value.recipe.name, value.recipe.yieldQuantity, value.status]);
      await client.query(`DELETE FROM recipe_items WHERE recipe_id=$1`, [recipeId]);
    } else {
      const insertedRecipe = await client.query<{ id: string }>(`INSERT INTO recipes (menu_item_id,name,yield_quantity,status) VALUES ($1,$2,$3,$4) RETURNING id`, [savedProductId, value.recipe.name, value.recipe.yieldQuantity, value.status]);
      recipeId = insertedRecipe.rows[0]!.id;
    }
    for (const item of value.recipe.items) await client.query(`INSERT INTO recipe_items (recipe_id,inventory_item_id,quantity,unit) VALUES ($1,$2,$3,$4)`, [recipeId, item.inventoryItemId, item.quantity, item.unit]);
    await writeAudit(req.user!, productId ? "UPDATE_MENU_PRODUCT_RECIPE" : "CREATE_MENU_PRODUCT_RECIPE", "MENU_ITEM", savedProductId!, `${productId ? "Updated" : "Created"} ${value.name} with its standard recipe`, { ingredientCount: value.recipe.items.length }, client);
    await client.query("COMMIT");
    return savedProductId!;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export const createMenuProduct: RequestHandler = async (req, res) => {
  const id = await saveMenuProduct(req);
  res.status(201).json({ success: true, data: { product: (await readMenuProducts(id))[0] } });
};
export const updateMenuProduct: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  await saveMenuProduct(req, id);
  res.json({ success: true, data: { product: (await readMenuProducts(id))[0] } });
};
