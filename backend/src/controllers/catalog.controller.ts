import type { RequestHandler } from "express";
import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import { writeAudit } from "../services/audit.service.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { AppError } from "../utils/appError.js";
import { idParams, inventoryItemInput, inventoryItemPatch, menuCategoryInput, menuCategoryPatch, menuItemInput, menuItemPatch, menuProductInput, menuProductReviewInput, menuProductStatusInput, recipeInput } from "../validators/masterData.js";
import { areUnitsCompatible, calculateIngredientCost, normalizeUnit } from "../services/unitConversion.service.js";
import { saveRecipeDefinition } from "../services/recipeVersion.service.js";

const inventorySelection = `SELECT ii.id,ii.sku,ii.name,ii.category,ii.unit,ii.unit_cost::float8 "unitCost",ii.reorder_level::float8 "reorderLevel",
  ii.status,ii.item_scope "itemScope",ii.origin_branch_id "originBranchId",b.name "originBranchName",
  ii.created_at "createdAt",ii.updated_at "updatedAt" FROM inventory_items ii LEFT JOIN branches b ON b.id=ii.origin_branch_id`;
export const listInventoryItems: RequestHandler = async (req,res) => {
  const branchId=getEffectiveBranchId(req.user!);
  const result=await pool.query(`${inventorySelection} ${branchId?"WHERE ii.item_scope='GLOBAL' OR ii.origin_branch_id=$1":""} ORDER BY ii.name`,branchId?[branchId]:[]);
  res.json({success:true,data:{items:result.rows}});
};
export const getInventoryItem: RequestHandler = async (req,res) => {
  const {id}=idParams.parse(req.params); const branchId=getEffectiveBranchId(req.user!);
  const result=await pool.query(`${inventorySelection} WHERE ii.id=$1 ${branchId?"AND (ii.item_scope='GLOBAL' OR ii.origin_branch_id=$2)":""}`,branchId?[id,branchId]:[id]);
  if(!result.rows[0]) throw new AppError(404,"INVENTORY_ITEM_NOT_FOUND","Inventory item not found");
  res.json({success:true,data:{item:result.rows[0]}});
};
export const createInventoryItem: RequestHandler = async (req,res) => {
  const v=inventoryItemInput.parse(req.body); const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const owner=req.user!.role==="OWNER";
    const originBranchId=owner?null:req.user!.branchId;
    if(!owner&&!originBranchId) throw new AppError(422,"BRANCH_REQUIRED","A Manager must belong to a branch");
    const code=await client.query<{sku:string}>(`SELECT 'ING-'||lpad(nextval('inventory_item_code_seq')::text,5,'0') sku`);
    const result=await client.query(`INSERT INTO inventory_items (sku,name,category,unit,unit_cost,reorder_level,status,item_scope,origin_branch_id,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id,sku,name,category,unit,unit_cost::float8 "unitCost",reorder_level::float8 "reorderLevel",status,item_scope "itemScope",origin_branch_id "originBranchId",created_at "createdAt",updated_at "updatedAt"`,
      [code.rows[0]!.sku,v.name,v.category,v.unit,v.unitCost,v.reorderLevel,v.status,owner?"GLOBAL":"BRANCH",originBranchId,req.user!.id]);
    if(owner) await client.query(`INSERT INTO branch_inventory_settings (branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,updated_by)
      SELECT id,$1,$2,$3,7,$4 FROM branches ON CONFLICT (branch_id,inventory_item_id) DO NOTHING`,[result.rows[0].id,v.unitCost,v.reorderLevel,req.user!.id]);
    else await client.query(`INSERT INTO branch_inventory_settings (branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,updated_by)
      VALUES ($1,$2,$3,$4,7,$5) ON CONFLICT (branch_id,inventory_item_id) DO NOTHING`,[originBranchId,result.rows[0].id,v.unitCost,v.reorderLevel,req.user!.id]);
    await writeAudit(req.user!,"CREATE_INVENTORY_ITEM","INVENTORY_ITEM",result.rows[0].id,`Created inventory item ${v.name}`,{},client);
    await client.query("COMMIT"); res.status(201).json({success:true,data:{item:result.rows[0]}});
  } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
};
export const updateInventoryItem: RequestHandler = async (req,res) => {
  const {id}=idParams.parse(req.params); const v=inventoryItemPatch.parse(req.body);
  const existing=await pool.query<{itemScope:"GLOBAL"|"BRANCH";originBranchId:string|null;unit:string}>(`SELECT item_scope "itemScope",origin_branch_id "originBranchId",unit FROM inventory_items WHERE id=$1`,[id]);
  if(!existing.rows[0]) throw new AppError(404,"INVENTORY_ITEM_NOT_FOUND","Inventory item not found");
  if(req.user!.role==="BRANCH_MANAGER"&&(existing.rows[0].itemScope!=="BRANCH"||existing.rows[0].originBranchId!==req.user!.branchId)) throw new AppError(403,"INVENTORY_ITEM_SCOPE_FORBIDDEN","Managers may update only ingredients created for their assigned branch");
  if(v.unit&&normalizeUnit(v.unit)!==normalizeUnit(existing.rows[0].unit)) {
    const used=await pool.query(`SELECT 1 FROM inventory_items ii WHERE ii.id=$1 AND (
      EXISTS(SELECT 1 FROM recipe_items ri WHERE ri.inventory_item_id=ii.id) OR
      EXISTS(SELECT 1 FROM branch_inventory_balances bib WHERE bib.inventory_item_id=ii.id) OR
      EXISTS(SELECT 1 FROM inventory_movements im WHERE im.inventory_item_id=ii.id) OR
      EXISTS(SELECT 1 FROM inventory_count_items ici WHERE ici.inventory_item_id=ii.id) OR
      EXISTS(SELECT 1 FROM purchase_order_items poi WHERE poi.inventory_item_id=ii.id) OR
      EXISTS(SELECT 1 FROM pos_sale_ingredient_usage usage WHERE usage.inventory_item_id=ii.id)) LIMIT 1`,[id]);
    if(used.rows[0]) throw new AppError(409,"INVENTORY_UNIT_IN_USE","The unit cannot be changed after this ingredient has been used. Create a new ingredient if a different inventory unit is required.");
  }
  const result=await pool.query(`UPDATE inventory_items SET name=COALESCE($2,name),category=COALESCE($3,category),unit=COALESCE($4,unit),unit_cost=COALESCE($5,unit_cost),reorder_level=COALESCE($6,reorder_level),status=COALESCE($7,status),updated_at=now() WHERE id=$1 RETURNING id,sku,name,category,unit,unit_cost::float8 "unitCost",reorder_level::float8 "reorderLevel",status,item_scope "itemScope",origin_branch_id "originBranchId",created_at "createdAt",updated_at "updatedAt"`,[id,v.name??null,v.category??null,v.unit??null,v.unitCost??null,v.reorderLevel??null,v.status??null]);
  await writeAudit(req.user!,"UPDATE_INVENTORY_ITEM","INVENTORY_ITEM",id,`Updated inventory item ${result.rows[0].name}`,{fields:Object.keys(v)});
  res.json({success:true,data:{item:result.rows[0]}});
};

const menuSelection = `SELECT id,code,name,category,selling_price::float8 "sellingPrice",status,created_at "createdAt",updated_at "updatedAt" FROM menu_items`;
export const listMenuItems: RequestHandler = async (req,res) => {
  const branchId = getEffectiveBranchId(req.user!);
  const result = await pool.query(
    `${menuSelection} m WHERE m.approval_status='APPROVED' AND m.status='ACTIVE'
      ${branchId ? `AND EXISTS (SELECT 1 FROM menu_item_branches mib WHERE mib.menu_item_id=m.id AND mib.branch_id=$1 AND mib.availability_status='APPROVED' AND mib.is_active=true)` : ""}
      ORDER BY m.name`,
    branchId ? [branchId] : [],
  );
  res.json({success:true,data:{items:result.rows}});
};
export const getMenuItem: RequestHandler = async (req,res) => { const {id}=idParams.parse(req.params); const result=await pool.query(`${menuSelection} WHERE id=$1`,[id]); if(!result.rows[0]) throw new AppError(404,"MENU_ITEM_NOT_FOUND","Menu item not found"); res.json({success:true,data:{item:result.rows[0]}}); };
export const createMenuItem: RequestHandler = async (req,res) => { const v=menuItemInput.parse(req.body); const result=await pool.query(`INSERT INTO menu_items (code,name,category,selling_price,status) VALUES ($1,$2,$3,$4,$5) RETURNING id,code,name,category,selling_price::float8 "sellingPrice",status,created_at "createdAt",updated_at "updatedAt"`,[v.code,v.name,v.category,v.sellingPrice,v.status]); await writeAudit(req.user!,"CREATE_MENU_ITEM","MENU_ITEM",result.rows[0].id,`Created menu item ${v.name}`); res.status(201).json({success:true,data:{item:result.rows[0]}}); };
export const updateMenuItem: RequestHandler = async (req,res) => { const {id}=idParams.parse(req.params); const v=menuItemPatch.parse(req.body); const result=await pool.query(`UPDATE menu_items SET code=COALESCE($2,code),name=COALESCE($3,name),category=COALESCE($4,category),selling_price=COALESCE($5,selling_price),status=COALESCE($6,status),updated_at=now() WHERE id=$1 RETURNING id,code,name,category,selling_price::float8 "sellingPrice",status,created_at "createdAt",updated_at "updatedAt"`,[id,v.code??null,v.name??null,v.category??null,v.sellingPrice??null,v.status??null]); if(!result.rows[0]) throw new AppError(404,"MENU_ITEM_NOT_FOUND","Menu item not found"); await writeAudit(req.user!,"UPDATE_MENU_ITEM","MENU_ITEM",id,`Updated menu item ${result.rows[0].name}`,{fields:Object.keys(v)}); res.json({success:true,data:{item:result.rows[0]}}); };

async function readRecipe(user: NonNullable<Express.Request["user"]>, id?: string) {
  const values:unknown[]=[];const conditions:string[]=[];
  if(id)conditions.push(`r.id=$${values.push(id)}`);
  const branchId=getEffectiveBranchId(user);
  if(branchId)conditions.push(`(m.product_scope='GLOBAL' OR m.origin_branch_id=$${values.push(branchId)})`);
  const where=conditions.length?`WHERE ${conditions.join(" AND ")}`:"";
  const result=await pool.query(`SELECT r.id,r.menu_item_id "menuItemId",r.name,r.yield_quantity::float8 "yieldQuantity",r.status,r.version,
    r.effective_from::text "effectiveFrom",r.effective_to::text "effectiveTo",r.change_reason "changeReason",
    concat(u.first_name,' ',u.last_name) "createdByName",r.created_at "createdAt",r.updated_at "updatedAt",
    json_build_object('id',m.id,'code',m.code,'name',m.name,'sellingPrice',m.selling_price::float8) "menuItem",
    COALESCE(json_agg(json_build_object('id',ri.id,'inventoryItemId',i.id,'sku',i.sku,'name',i.name,'quantity',ri.quantity::float8,'unit',ri.unit,'inventoryUnit',i.unit,'unitCost',i.unit_cost::float8)) FILTER (WHERE ri.id IS NOT NULL),'[]') items
    FROM recipes r JOIN menu_items m ON m.id=r.menu_item_id LEFT JOIN users u ON u.id=r.created_by
    LEFT JOIN recipe_items ri ON ri.recipe_id=r.id LEFT JOIN inventory_items i ON i.id=ri.inventory_item_id ${where}
    GROUP BY r.id,m.id,u.id ORDER BY m.name,r.version DESC`,values); return result.rows;
}
export const listRecipes: RequestHandler=async(req,res)=>res.json({success:true,data:{recipes:await readRecipe(req.user!)}});
export const getRecipe: RequestHandler=async(req,res)=>{const{id}=idParams.parse(req.params);const recipe=(await readRecipe(req.user!,id))[0];if(!recipe)throw new AppError(404,"RECIPE_NOT_FOUND","Recipe not found");res.json({success:true,data:{recipe}});};
async function saveRecipe(req: Parameters<RequestHandler>[0], id?: string) {
  const v=recipeInput.parse(req.body); const client=await pool.connect();
  try { await client.query("BEGIN");
    const saved=await saveRecipeDefinition(client,{...v,recipeId:id,createdBy:req.user!.id});
    await writeAudit(req.user!,saved.createdVersion?"CREATE_RECIPE_VERSION":id?"UPDATE_RECIPE":"CREATE_RECIPE","RECIPE",saved.recipeId,`${saved.createdVersion?"Created a new version of":id?"Updated":"Created"} recipe ${v.name}`,{ingredientCount:v.items.length,version:saved.version},client); await client.query("COMMIT"); return saved.recipeId;
  } catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export const createRecipe: RequestHandler=async(req,res)=>{const id=await saveRecipe(req);res.status(201).json({success:true,data:{recipe:(await readRecipe(req.user!,id))[0]}});};
export const updateRecipe: RequestHandler=async(req,res)=>{const{id}=idParams.parse(req.params);const savedId=await saveRecipe(req,id);res.json({success:true,data:{recipe:(await readRecipe(req.user!,savedId))[0]}});};

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

async function readMenuProducts(user: NonNullable<Express.Request["user"]>, id?: string) {
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (id) conditions.push(`m.id=$${values.push(id)}`);
  const branchId = getEffectiveBranchId(user);
  const branchParameter = branchId ? values.push(branchId) : null;
  if (branchId) conditions.push(`(m.product_scope='GLOBAL' OR m.origin_branch_id=$${branchParameter})`);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const unitCost = branchId
    ? `COALESCE((SELECT bis.current_unit_cost FROM branch_inventory_settings bis WHERE bis.inventory_item_id=ii.id AND bis.branch_id=$${branchParameter}),ii.unit_cost)`
    : `COALESCE((SELECT avg(bis.current_unit_cost) FROM branch_inventory_settings bis WHERE bis.inventory_item_id=ii.id),ii.unit_cost)`;
  const result = await pool.query(
    `SELECT m.id,m.code,m.name,COALESCE(c.name,m.category) category,c.id "categoryId",m.description,
            m.selling_price::float8 "sellingPrice",m.status,m.created_at "createdAt",m.updated_at "updatedAt",
            m.product_scope "productScope",m.origin_branch_id "originBranchId",ob.name "originBranchName",
            m.approval_status "approvalStatus",m.owner_review_comment "ownerReviewComment",concat(cu.first_name,' ',cu.last_name) "createdByName",
            ${branchId ? `(SELECT mib.availability_status FROM menu_item_branches mib WHERE mib.menu_item_id=m.id AND mib.branch_id=$${branchParameter})` : "NULL::text"} "branchAvailabilityStatus",
            ${branchId ? `(SELECT CASE WHEN mib.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END FROM menu_item_branches mib WHERE mib.menu_item_id=m.id AND mib.branch_id=$${branchParameter})` : "NULL::text"} "branchMenuStatus",
            COALESCE((SELECT json_agg(json_build_object('branchId',b.id,'branchName',b.name,'status',mib.availability_status,'isActive',mib.is_active,'reviewComment',mib.review_comment,'reviewedAt',mib.reviewed_at) ORDER BY b.name) FROM menu_item_branches mib JOIN branches b ON b.id=mib.branch_id WHERE mib.menu_item_id=m.id ${branchId ? `AND mib.branch_id=$${branchParameter}` : ""}),'[]') "branchApprovals",
            r.id "recipeId",r.name "recipeName",r.yield_quantity::float8 "yieldQuantity",r.version "recipeVersion",
            r.effective_from::text "recipeEffectiveFrom",r.effective_to::text "recipeEffectiveTo",r.change_reason "recipeChangeReason",
            EXISTS(SELECT 1 FROM pos_sale_items history_sale WHERE history_sale.menu_item_id=m.id) "recipeHasHistoricalSales",
            COALESCE((SELECT json_agg(json_build_object('id',rh.id,'version',rh.version,'effectiveFrom',rh.effective_from::text,
              'effectiveTo',rh.effective_to::text,'yieldQuantity',rh.yield_quantity::float8,'status',rh.status,
              'changeReason',rh.change_reason,'createdByName',concat(hu.first_name,' ',hu.last_name),'createdAt',rh.created_at)
              ORDER BY rh.version DESC) FROM recipes rh LEFT JOIN users hu ON hu.id=rh.created_by WHERE rh.menu_item_id=m.id),'[]') "recipeHistory",
            COALESCE(json_agg(json_build_object('id',ri.id,'inventoryItemId',ii.id,'sku',ii.sku,'name',ii.name,
              'quantity',ri.quantity::float8,'unit',ri.unit,'inventoryUnit',ii.unit,'unitCost',(${unitCost})::float8)
              ORDER BY ii.name) FILTER (WHERE ri.id IS NOT NULL),'[]') ingredients
       FROM menu_items m
       LEFT JOIN menu_categories c ON c.id=m.category_id
       LEFT JOIN branches ob ON ob.id=m.origin_branch_id
       LEFT JOIN users cu ON cu.id=m.created_by
       LEFT JOIN LATERAL (SELECT candidate.* FROM recipes candidate WHERE candidate.menu_item_id=m.id
         AND candidate.effective_from<=CURRENT_DATE AND (candidate.effective_to IS NULL OR candidate.effective_to>CURRENT_DATE)
         ORDER BY candidate.effective_from DESC LIMIT 1) r ON true
       LEFT JOIN recipe_items ri ON ri.recipe_id=r.id
       LEFT JOIN inventory_items ii ON ii.id=ri.inventory_item_id
       ${where}
      GROUP BY m.id,c.id,r.id,r.name,r.yield_quantity,r.version,r.effective_from,r.effective_to,r.change_reason,ob.id,cu.id
      ORDER BY m.name`,
    values,
  );
  return result.rows.map((row) => {
    const yieldQuantity=Number(row.yieldQuantity??1);
    const ingredients=(row.ingredients as Array<{quantity:number;unit:string;inventoryUnit:string;unitCost:number}>).map((item)=>({
      ...item,
      ingredientCost:calculateIngredientCost({recipeQuantity:Number(item.quantity),recipeUnit:item.unit,inventoryUnit:item.inventoryUnit,unitCost:Number(item.unitCost),yieldQuantity}),
    }));
    const recipeCost=ingredients.reduce((sum,item)=>sum+item.ingredientCost,0);
    const sellingPrice=Number(row.sellingPrice);
    return {...row,ingredients,recipeCost,marginAmount:sellingPrice-recipeCost,marginRate:sellingPrice>0?(sellingPrice-recipeCost)/sellingPrice*100:0};
  });
}

async function notifyOwnersOfMenuChange(
  client: Pick<PoolClient, "query">,
  user: NonNullable<Express.Request["user"]>,
  type: string,
  title: string,
  productId: string,
  productName: string,
  action: string,
) {
  const actor = await client.query<{ actorName: string; branchName: string | null }>(
    `SELECT concat(u.first_name,' ',u.last_name) "actorName",b.name "branchName"
       FROM users u LEFT JOIN branches b ON b.id=u.branch_id WHERE u.id=$1`,
    [user.id],
  );
  const actorName = actor.rows[0]?.actorName || "A Branch Manager";
  const branchName = actor.rows[0]?.branchName;
  const context = branchName ? `${actorName} (${branchName})` : actorName;
  await client.query(
    `INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
     SELECT id,$1,$2,$3,$4,'MENU_ITEM',$5 FROM users WHERE role='OWNER' AND status='ACTIVE'`,
    [user.branchId, type, title, `${context} ${action} ${productName}.`, productId],
  );
}

async function notifyManagersOfMenuChange(
  client: Pick<PoolClient, "query">,
  user: NonNullable<Express.Request["user"]>,
  branchId: string | null,
  type: string,
  title: string,
  productId: string,
  productName: string,
  action: string,
  requiresBranchReview = true,
) {
  const actor = await client.query<{ actorName: string }>(`SELECT concat(first_name,' ',last_name) "actorName" FROM users WHERE id=$1`, [user.id]);
  const actorName = actor.rows[0]?.actorName || "The Owner";
  await client.query(
    `INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
     SELECT id,branch_id,$2,$3,$4,'MENU_ITEM',$5 FROM users
      WHERE role='BRANCH_MANAGER' AND status='ACTIVE' AND ($1::uuid IS NULL OR branch_id=$1)`,
    [branchId, type, title, `${actorName} ${action} ${productName}.${requiresBranchReview ? " Review its availability for your branch." : ""}`, productId],
  );
}

export const listMenuProducts: RequestHandler = async (req, res) => res.json({ success: true, data: { products: await readMenuProducts(req.user!) } });
export const getMenuProduct: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const product = (await readMenuProducts(req.user!, id))[0];
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
    const ingredients = await client.query<{ id: string; name: string; unit: string; itemScope:"GLOBAL"|"BRANCH";originBranchId:string|null }>(
      `SELECT id,name,unit,item_scope "itemScope",origin_branch_id "originBranchId" FROM inventory_items
        WHERE id=ANY($1::uuid[]) AND status='ACTIVE'`, [ingredientIds],
    );
    if (ingredients.rows.length !== ingredientIds.length) throw new AppError(422, "RECIPE_INGREDIENT_INVALID", "One or more inventory ingredients are missing or inactive");
    const invalidScope=ingredients.rows.find((ingredient)=>req.user!.role==="OWNER"
      ? ingredient.itemScope!=="GLOBAL"
      : ingredient.itemScope==="BRANCH"&&ingredient.originBranchId!==req.user!.branchId);
    if(invalidScope) throw new AppError(422,"RECIPE_INGREDIENT_SCOPE_INVALID","The recipe contains an ingredient that is not available to this product scope");
    for (const item of value.recipe.items) {
      const ingredient = ingredients.rows.find((candidate) => candidate.id === item.inventoryItemId)!;
      if (!areUnitsCompatible(ingredient.unit,item.unit)) throw new AppError(422, "RECIPE_UNIT_MISMATCH", `${ingredient.name} uses ${ingredient.unit}; select a compatible ${normalizeUnit(ingredient.unit)} measurement unit`);
    }

    let savedProductId = productId;
    const existing = productId ? await client.query<{ status: "ACTIVE" | "INACTIVE"; productScope: "GLOBAL" | "BRANCH"; originBranchId: string | null; approvalStatus: "PENDING_OWNER" | "APPROVED" | "REJECTED" }>(
      `SELECT status,product_scope "productScope",origin_branch_id "originBranchId",approval_status "approvalStatus" FROM menu_items WHERE id=$1 FOR UPDATE`,
      [productId],
    ) : null;
    const previous = existing?.rows[0];
    if (productId && !previous) throw new AppError(404, "MENU_PRODUCT_NOT_FOUND", "Menu product not found");
    if (productId && req.user!.role === "BRANCH_MANAGER" && (previous!.productScope !== "BRANCH" || previous!.originBranchId !== req.user!.branchId)) {
      throw new AppError(403, "PRODUCT_SCOPE_FORBIDDEN", "Managers may edit only products proposed for their assigned branch");
    }
    if (productId && req.user!.role === "OWNER" && previous!.productScope !== "GLOBAL") {
      throw new AppError(403, "PRODUCT_SCOPE_FORBIDDEN", "Owners may review branch product proposals but may edit only global products");
    }
    if (productId) {
      const updated = await client.query(
        `UPDATE menu_items SET name=$2,category_id=$3,category=$4,selling_price=$5,description=$6,status='ACTIVE',
          approval_status=CASE WHEN $7='BRANCH_MANAGER' THEN 'PENDING_OWNER' ELSE approval_status END,updated_at=now()
         WHERE id=$1 RETURNING id`,
        [productId, value.name, value.categoryId, category.rows[0].name, value.sellingPrice, value.description, req.user!.role],
      );
      if (!updated.rows[0]) throw new AppError(404, "MENU_PRODUCT_NOT_FOUND", "Menu product not found");
    } else {
      const ownerCreated = req.user!.role === "OWNER";
      const codeResult = await client.query<{ code: string }>(`SELECT 'PRD-'||lpad(nextval('menu_product_code_seq')::text,5,'0') code`);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO menu_items (code,name,category_id,category,selling_price,description,status,created_by,product_scope,origin_branch_id,approval_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [codeResult.rows[0]!.code, value.name, value.categoryId, category.rows[0].name, value.sellingPrice, value.description, "ACTIVE", req.user!.id, ownerCreated ? "GLOBAL" : "BRANCH", ownerCreated ? null : req.user!.branchId, ownerCreated ? "APPROVED" : "PENDING_OWNER"],
      );
      savedProductId = inserted.rows[0]!.id;
    }

    const existingRecipe = await client.query<{ id: string }>(`SELECT id FROM recipes WHERE menu_item_id=$1
      ORDER BY (effective_from<=CURRENT_DATE AND (effective_to IS NULL OR effective_to>CURRENT_DATE)) DESC,version DESC LIMIT 1`, [savedProductId]);
    let recipeId = existingRecipe.rows[0]?.id;
    const savedRecipe=await saveRecipeDefinition(client,{
      recipeId,menuItemId:savedProductId!,name:`${value.name} Standard Recipe`,yieldQuantity:value.recipe.yieldQuantity,
      status:"ACTIVE",items:value.recipe.items,effectiveFrom:value.recipe.effectiveFrom,changeReason:value.recipe.changeReason,createdBy:req.user!.id,
    });
    recipeId=savedRecipe.recipeId;
    if (!productId && req.user!.role === "OWNER") {
      await client.query(`INSERT INTO menu_item_branches (menu_item_id,branch_id,availability_status) SELECT $1,id,'PENDING_MANAGER' FROM branches WHERE status='ACTIVE'`, [savedProductId]);
    } else if (!productId || req.user!.role === "BRANCH_MANAGER") {
      await client.query(
        `INSERT INTO menu_item_branches (menu_item_id,branch_id,availability_status,reviewed_by,reviewed_at)
         VALUES ($1,$2,'PENDING_OWNER',NULL,NULL)
         ON CONFLICT (menu_item_id,branch_id) DO UPDATE SET availability_status='PENDING_OWNER',is_active=false,reviewed_by=NULL,reviewed_at=NULL,updated_at=now()`,
        [savedProductId, req.user!.branchId],
      );
    }
    await writeAudit(req.user!, savedRecipe.createdVersion ? "CREATE_RECIPE_VERSION" : productId ? "UPDATE_MENU_PRODUCT_RECIPE" : "CREATE_MENU_PRODUCT_RECIPE", "MENU_ITEM", savedProductId!, `${savedRecipe.createdVersion ? "Created a new recipe version for" : productId ? "Updated" : "Created"} ${value.name}`, { ingredientCount: value.recipe.items.length,recipeVersion:savedRecipe.version,effectiveFrom:value.recipe.effectiveFrom??null }, client);
    const action = productId ? "updated" : "created";
    if (req.user!.role === "BRANCH_MANAGER") {
      await notifyOwnersOfMenuChange(client, req.user!, productId ? "MENU_PRODUCT_UPDATED" : "MENU_PRODUCT_APPROVAL_REQUIRED", productId ? "Branch Product Updated" : "Product Approval Required", savedProductId!, value.name, `${action} the branch product proposal`);
    } else {
      const targetBranch = previous?.productScope === "BRANCH" ? previous.originBranchId : null;
      await notifyManagersOfMenuChange(client, req.user!, targetBranch, productId ? "MENU_PRODUCT_UPDATED" : "MENU_PRODUCT_BRANCH_REVIEW", productId ? "Menu Product Updated" : "New Menu Product Available", savedProductId!, value.name, action, !productId);
    }
    await client.query("COMMIT");
    return savedProductId!;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export const createMenuProduct: RequestHandler = async (req, res) => {
  const id = await saveMenuProduct(req);
  res.status(201).json({ success: true, data: { product: (await readMenuProducts(req.user!, id))[0] } });
};
export const updateMenuProduct: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  await saveMenuProduct(req, id);
  res.json({ success: true, data: { product: (await readMenuProducts(req.user!, id))[0] } });
};

export const updateMenuProductStatus: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { status } = menuProductStatusInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ name: string }>(`SELECT name FROM menu_items WHERE id=$1 AND approval_status='APPROVED' FOR UPDATE`, [id]);
    const current = existing.rows[0];
    if (!current) throw new AppError(404, "MENU_PRODUCT_NOT_FOUND", "Menu product not found");
    const updated = await client.query<{ menuItemId: string }>(
      `UPDATE menu_item_branches SET is_active=$3,updated_at=now()
        WHERE menu_item_id=$1 AND branch_id=$2 AND availability_status='APPROVED'
        RETURNING menu_item_id "menuItemId"`,
      [id, req.user!.branchId, status === "ACTIVE"],
    );
    if (!updated.rows[0]) throw new AppError(409, "PRODUCT_NOT_APPROVED_FOR_BRANCH", "This product must be approved for your branch before its menu status can be changed");
    await writeAudit(req.user!, "UPDATE_BRANCH_MENU_STATUS", "MENU_ITEM", id, `${status === "ACTIVE" ? "Activated" : "Inactivated"} ${current.name} for the assigned branch`, { status, branchId: req.user!.branchId }, client);
    await notifyOwnersOfMenuChange(client, req.user!, "MENU_PRODUCT_BRANCH_STATUS_CHANGED", "Branch Menu Status Changed", id, current.name, `${status === "ACTIVE" ? "activated" : "inactivated"}`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  res.json({ success: true, data: { product: (await readMenuProducts(req.user!, id))[0] } });
};

export const deleteMenuProduct: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ name: string; productScope: "GLOBAL" | "BRANCH"; originBranchId: string | null }>(`SELECT name,product_scope "productScope",origin_branch_id "originBranchId" FROM menu_items WHERE id=$1 FOR UPDATE`, [id]);
    const product = existing.rows[0];
    if (!product) throw new AppError(404, "MENU_PRODUCT_NOT_FOUND", "Menu product not found");
    if (req.user!.role === "BRANCH_MANAGER" && (product.productScope !== "BRANCH" || product.originBranchId !== req.user!.branchId)) throw new AppError(403, "PRODUCT_SCOPE_FORBIDDEN", "Managers may delete only unused products proposed for their branch");
    if (req.user!.role === "OWNER" && product.productScope !== "GLOBAL") throw new AppError(403, "PRODUCT_SCOPE_FORBIDDEN", "Owners may delete only global products");
    const usage = await client.query<{ count: number }>(`SELECT count(*)::int count FROM pos_sale_items WHERE menu_item_id=$1`, [id]);
    if ((usage.rows[0]?.count ?? 0) > 0) {
      throw new AppError(409, "MENU_PRODUCT_HAS_SALES", "This product has POS sales history and cannot be deleted. Set it to Inactive instead to preserve historical reports.");
    }
    await client.query(`DELETE FROM recipes WHERE menu_item_id=$1`, [id]);
    await client.query(`DELETE FROM menu_items WHERE id=$1`, [id]);
    await writeAudit(req.user!, "DELETE_MENU_PRODUCT_RECIPE", "MENU_ITEM", id, `Deleted unused menu product ${product.name} and its recipe`, {}, client);
    if (req.user!.role === "BRANCH_MANAGER") await notifyOwnersOfMenuChange(client, req.user!, "MENU_PRODUCT_DELETED", "Branch Product Deleted", id, product.name, "deleted the branch product proposal");
    else await notifyManagersOfMenuChange(client, req.user!, product.productScope === "BRANCH" ? product.originBranchId : null, "MENU_PRODUCT_DELETED", "Menu Product Deleted", id, product.name, "deleted", false);
    await client.query("COMMIT");
    res.json({ success: true, data: { id } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const reviewManagerProduct: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { decision, comment } = menuProductReviewInput.parse(req.body);
  const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ name: string; originBranchId: string }>(`SELECT name,origin_branch_id "originBranchId" FROM menu_items WHERE id=$1 AND product_scope='BRANCH' AND approval_status='PENDING_OWNER' FOR UPDATE`, [id]);
    const product = existing.rows[0];
    if (!product) throw new AppError(409, "PRODUCT_NOT_PENDING_OWNER", "This branch product is no longer awaiting Owner approval");
    await client.query(`UPDATE menu_items SET approval_status=$2,owner_review_comment=NULLIF($3,''),updated_at=now() WHERE id=$1`, [id, status, comment]);
    await client.query(`UPDATE menu_item_branches SET availability_status=$3,is_active=false,review_comment=NULLIF($5,''),reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE menu_item_id=$1 AND branch_id=$4`, [id, req.user!.id, status, product.originBranchId, comment]);
    await writeAudit(req.user!, `OWNER_${decision}_MENU_PRODUCT`, "MENU_ITEM", id, `${decision === "APPROVE" ? "Approved" : "Rejected"} branch product ${product.name}`, { branchId: product.originBranchId, comment: comment || null }, client);
    await notifyManagersOfMenuChange(client, req.user!, product.originBranchId, `MENU_PRODUCT_${status}`, `Branch Product ${decision === "APPROVE" ? "Approved" : "Rejected"}`, id, product.name, `${decision === "APPROVE" ? "approved" : "rejected"}${comment ? ` with comment: ${comment}` : ""}`, false);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  res.json({ success: true, data: { product: (await readMenuProducts(req.user!, id))[0] } });
};

export const reviewOwnerProductForBranch: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { decision, comment } = menuProductReviewInput.parse(req.body);
  const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const branchId = req.user!.branchId!;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reviewed = await client.query<{ name: string }>(
      `UPDATE menu_item_branches mib SET availability_status=$3,is_active=false,review_comment=NULLIF($5,''),reviewed_by=$2,reviewed_at=now(),updated_at=now()
         FROM menu_items m WHERE mib.menu_item_id=$1 AND mib.branch_id=$4 AND mib.availability_status='PENDING_MANAGER'
           AND m.id=mib.menu_item_id AND m.product_scope='GLOBAL' RETURNING m.name`,
      [id, req.user!.id, status, branchId, comment],
    );
    const product = reviewed.rows[0];
    if (!product) throw new AppError(409, "PRODUCT_NOT_PENDING_MANAGER", "This product is no longer awaiting your branch decision");
    await writeAudit(req.user!, `MANAGER_${decision}_MENU_PRODUCT`, "MENU_ITEM", id, `${decision === "APPROVE" ? "Approved" : "Rejected"} ${product.name} for the assigned branch`, { branchId }, client);
    await notifyOwnersOfMenuChange(client, req.user!, `MENU_PRODUCT_BRANCH_${status}`, `Branch ${decision === "APPROVE" ? "Approved" : "Rejected"} Product`, id, product.name, decision === "APPROVE" ? "approved for the branch" : "rejected for the branch");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  res.json({ success: true, data: { product: (await readMenuProducts(req.user!, id))[0] } });
};
