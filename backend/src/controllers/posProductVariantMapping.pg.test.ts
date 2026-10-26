import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl=process.env.POS_MAPPING_E2E_DATABASE_URL;
const suite=databaseUrl?describe:describe.skip;

suite("POS mapping Quick Assign PostgreSQL integration",()=>{
  const runId=crypto.randomUUID().slice(0,8);
  const ownerId=crypto.randomUUID();
  const sourceBranchId=crypto.randomUUID();
  const targetBranchId=crypto.randomUUID();
  const itemId=crypto.randomUUID();
  const productId=crypto.randomUUID();
  const variantId=crypto.randomUUID();
  const recipeId=crypto.randomUUID();
  const sourceId=crypto.randomUUID();
  const targetId=crypto.randomUUID();
  let pool:pg.Pool;
  let appPool:pg.Pool;
  let copyMappings:Awaited<typeof import("./posProductVariantMapping.controller.js")>["copyApprovedGlobalPosMappings"];
  let confirmAndActivate:Awaited<typeof import("./posProductVariantMapping.controller.js")>["confirmAndActivatePosMappings"];

  beforeAll(async()=>{
    if(!databaseUrl)throw new Error("POS_MAPPING_E2E_DATABASE_URL is required");
    const databaseName=decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if(!/^libro_pos_mapping_[a-z0-9_]*e2e$/i.test(databaseName))throw new Error("Refusing to run outside a disposable libro_pos_mapping_*_e2e database");
    process.env.NODE_ENV="test";process.env.DATABASE_URL=databaseUrl;
    pool=new pg.Pool({connectionString:databaseUrl});
    const controller=await import("./posProductVariantMapping.controller.js");
    copyMappings=controller.copyApprovedGlobalPosMappings;confirmAndActivate=controller.confirmAndActivatePosMappings;
    appPool=(await import("../config/database.js")).pool;
    await pool.query(`INSERT INTO branches(id,code,name,location) VALUES
      ($1,$2,$3,'Disposable test'),($4,$5,$6,'Disposable test')`,
    [sourceBranchId,`QAS-${runId}`,`Quick Source ${runId}`,targetBranchId,`QAT-${runId}`,`Quick Target ${runId}`]);
    await pool.query(`INSERT INTO users(id,first_name,last_name,email,username,password_hash,role,status)
      VALUES($1,'Quick','Owner',$2,$3,'unused','OWNER','ACTIVE')`,[ownerId,`quick-${runId}@e2e.local`,`quick-${runId}`]);
    await pool.query(`INSERT INTO inventory_items(id,sku,name,category,unit,unit_cost,reorder_level)
      VALUES($1,$2,'Quick Milk','Test','ml',1,0)`,[itemId,`QI-${runId}`]);
    await pool.query(`INSERT INTO menu_items(id,code,name,category,selling_price,product_scope,approval_status)
      VALUES($1,$2,'Quick Latte','Coffee',100,'GLOBAL','APPROVED')`,[productId,`QP-${runId}`]);
    await pool.query(`INSERT INTO menu_item_variants(id,menu_item_id,name,selling_price,status) VALUES($1,$2,'Standard',100,'ACTIVE')`,[variantId,productId]);
    await pool.query(`INSERT INTO recipes(id,menu_item_id,menu_item_variant_id,name,yield_quantity,status,effective_from)
      VALUES($1,$2,$3,'Quick Recipe',1,'ACTIVE',CURRENT_DATE-1)`,[recipeId,productId,variantId]);
    await pool.query(`INSERT INTO recipe_items(recipe_id,inventory_item_id,quantity,unit) VALUES($1,$2,10,'ml')`,[recipeId,itemId]);
    await pool.query(`INSERT INTO pos_sources(id,source_code,display_name,supported_format,branch_id,status,format_verified_by,format_verified_at)
      VALUES($1,$2,'Source POS','CANONICAL_CSV',$3,'ACTIVE',$4,now()),($5,$6,'Target POS','CANONICAL_CSV',$7,'INACTIVE',NULL,NULL)`,
    [sourceId,`QS-${runId}`,sourceBranchId,ownerId,targetId,`QT-${runId}`,targetBranchId]);
    await pool.query(`INSERT INTO pos_product_variant_mappings(pos_source_id,branch_id,source_product_name,source_product_code,menu_item_variant_id,status,review_status,reviewed_by,reviewed_at)
      VALUES($1,NULL,'Quick Latte','QLAT',$2,'ACTIVE','APPROVED',$3,now())`,[sourceId,variantId,ownerId]);
  });

  afterAll(async()=>{if(appPool)await appPool.end();if(pool)await pool.end();});

  it("copies as Pending, preserves the source, then atomically approves once",async()=>{
    const response=()=>{const result={status:()=>result,json:(body:unknown)=>{result.body=body;},body:undefined as unknown};return result;};
    const copied=response();
    await copyMappings({body:{sourcePosSourceId:sourceId,targetPosSourceId:targetId},user:{id:ownerId,role:"OWNER",branchId:null}} as never,copied as never,(()=>undefined) as never);
    expect((copied.body as {data:{copied:number;skipped:number;incompatible:number}}).data).toMatchObject({copied:1,skipped:0,incompatible:0});
    expect((await pool.query(`SELECT status,review_status "reviewStatus" FROM pos_product_variant_mappings WHERE pos_source_id=$1`,[targetId])).rows).toEqual([{status:"INACTIVE",reviewStatus:"PENDING"}]);
    expect((await pool.query(`SELECT count(*)::int count FROM pos_product_variant_mappings WHERE pos_source_id=$1 AND status='ACTIVE'`,[sourceId])).rows[0].count).toBe(1);

    const approved=response();
    await confirmAndActivate({params:{id:targetId},body:{confirmedSupportedFormat:"CANONICAL_CSV"},user:{id:ownerId,role:"OWNER",branchId:null}} as never,approved as never,(()=>undefined) as never);
    expect((approved.body as {data:{approved:number}}).data.approved).toBe(1);
    expect((await pool.query(`SELECT status,format_verified_at IS NOT NULL "formatVerified" FROM pos_sources WHERE id=$1`,[targetId])).rows).toEqual([{status:"ACTIVE",formatVerified:true}]);
    expect((await pool.query(`SELECT status,review_status "reviewStatus" FROM pos_product_variant_mappings WHERE pos_source_id=$1`,[targetId])).rows).toEqual([{status:"ACTIVE",reviewStatus:"APPROVED"}]);
    expect((await pool.query(`SELECT action FROM audit_logs WHERE entity_id=$1 AND action IN ('VERIFY_POS_SOURCE_FORMAT','ACTIVATE_POS_SOURCE') ORDER BY created_at,action`,[targetId])).rows.map(row=>row.action).sort()).toEqual(["ACTIVATE_POS_SOURCE","VERIFY_POS_SOURCE_FORMAT"]);
    await pool.query(`INSERT INTO pos_product_variant_mappings(pos_source_id,branch_id,source_product_name,source_product_code,menu_item_variant_id,status,review_status)
      VALUES($1,NULL,'Quick Latte Second','QLAT-2',$2,'INACTIVE','PENDING')`,[targetId,variantId]);
    const concurrent=await Promise.allSettled([
      confirmAndActivate({params:{id:targetId},body:{confirmedSupportedFormat:"CANONICAL_CSV"},user:{id:ownerId,role:"OWNER",branchId:null}} as never,response() as never,(()=>undefined) as never),
      confirmAndActivate({params:{id:targetId},body:{confirmedSupportedFormat:"CANONICAL_CSV"},user:{id:ownerId,role:"OWNER",branchId:null}} as never,response() as never,(()=>undefined) as never),
    ]);
    expect(concurrent.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect(concurrent.filter(result=>result.status==="rejected")).toHaveLength(1);
    expect((concurrent.find(result=>result.status==="rejected") as PromiseRejectedResult).reason).toMatchObject({code:"POS_MAPPING_NONE_PENDING"});
  });
});
