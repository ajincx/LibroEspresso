import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl=process.env.PHASE_C_E2E_DATABASE_URL;
const branchId="71000000-0000-4000-8000-000000000001";
const managerId="71000000-0000-4000-8000-000000000002";
const staffId="71000000-0000-4000-8000-000000000003";
const itemId="71000000-0000-4000-8000-000000000004";
let pool:pg.Pool;
let createIncidentReport:any,reviewIncidentReport:any,linkIncidentToInvestigation:any;
const response=()=>{const state:{status?:number;body?:any}={};return{state,res:{status(code:number){state.status=code;return this;},json(body:any){state.body=body;return this;}}};};
const manilaDate=(offsetDays=0)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Date.now()+offsetDays*86400000));
const manilaNoonIso=(date:string)=>new Date(`${date}T12:00:00+08:00`).toISOString();
const recentManilaSameDayIso=()=>{
  const startOfToday=new Date(`${manilaDate()}T00:00:00+08:00`).getTime();
  return new Date(Math.max(startOfToday,Date.now()-5*60*1000)).toISOString();
};

describe.skipIf(!databaseUrl)("Phase 3 Fix 10 incident and notification PostgreSQL integration",()=>{
  beforeAll(async()=>{
    if(!databaseUrl)throw new Error("PHASE_C_E2E_DATABASE_URL is required");
    const databaseName=decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if(!/^libro_phasec_[a-z0-9_]*e2e$/i.test(databaseName))throw new Error("Refusing to run outside a disposable libro_phasec_*_e2e database");
    process.env.NODE_ENV="test";process.env.DATABASE_URL=databaseUrl;
    pool=new pg.Pool({connectionString:databaseUrl});
    expect((await pool.query("SELECT current_database() name")).rows[0].name).toBe(databaseName);
    await pool.query(`INSERT INTO branches(id,code,name,location) VALUES($1,'P3F10','Phase 3 Fix 10','Disposable')`,[branchId]);
    await pool.query(`INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role) VALUES
      ($1,$3,'Maria','Manager','p3f10.manager@example.test','p3f10_manager','unused','BRANCH_MANAGER'),
      ($2,$3,'Sam','Staff','p3f10.staff@example.test','p3f10_staff','unused','STAFF')`,[managerId,staffId,branchId]);
    await pool.query(`INSERT INTO inventory_items(id,sku,name,category,unit,unit_cost,reorder_level,status,item_scope) VALUES($1,'P3F10-BEAN','Disposable Beans','Coffee','g',0.5,0,'ACTIVE','GLOBAL')`,[itemId]);
    ({createIncidentReport,reviewIncidentReport,linkIncidentToInvestigation}=await import("./operations.controller.js"));
  });
  afterAll(async()=>{await pool?.end();});

  it("persists a same-day classified incident in canonical units and targets its Manager notification",async()=>{
    const out=response();
    await createIncidentReport({user:{id:staffId,role:"STAFF",branchId},body:{items:[{inventoryItemId:itemId,quantity:1,enteredUnit:"kg"}],incidentType:"WASTAGE",occurredAt:recentManilaSameDayIso(),reason:"A preparation batch was accidentally discarded."}} as never,out.res as never,()=>{});
    expect(out.state.status).toBe(201);
    const incidentId=out.state.body.data.incident.id;
    const incident=(await pool.query(`SELECT incident_type "incidentType",quantity::float8,status FROM incident_reports WHERE id=$1`,[incidentId])).rows[0];
    expect(incident).toEqual({incidentType:"WASTAGE",quantity:1000,status:"PENDING"});
    expect((await pool.query(`SELECT quantity::float8,unit FROM incident_report_items WHERE incident_report_id=$1`,[incidentId])).rows[0]).toEqual({quantity:1000,unit:"g"});
    expect((await pool.query(`SELECT recipient_user_id::text "recipient",branch_id::text "branchId",type,entity_type "entityType",entity_id::text "entityId" FROM notifications WHERE entity_id=$1`,[incidentId])).rows[0]).toEqual({recipient:managerId,branchId,type:"INCIDENT_SUBMITTED",entityType:"INCIDENT_REPORT",entityId:incidentId});
  });

  it("requires a late reason, verifies the late request, and links only the eligible investigation",async()=>{
    const date=manilaDate(-1);
    const countId=(await pool.query(`INSERT INTO inventory_counts(count_no,branch_id,count_date,submitted_by,count_type,effective_at) VALUES('IC-P3F10-LATE',$1,$2,$3,'CLOSING',$2::date+time '23:59') RETURNING id`,[branchId,date,managerId])).rows[0].id;
    const countItemId=(await pool.query(`INSERT INTO inventory_count_items(inventory_count_id,inventory_item_id,previous_actual_quantity,expected_quantity,actual_quantity,variance_quantity,variance_value,unit) VALUES($1,$2,1000,1000,900,-100,-50,'g') RETURNING id`,[countId,itemId])).rows[0].id;
    const reportId=(await pool.query(`INSERT INTO shrinkage_reports(report_no,branch_id,inventory_item_id,inventory_count_item_id,expected_quantity,actual_quantity,variance_quantity,variance_value,unit,status,submitted_by) VALUES('SR-P3F10-LATE',$1,$2,$3,1000,900,-100,-50,'g','DETECTED',$4) RETURNING id`,[branchId,itemId,countItemId,managerId])).rows[0].id;
    const missing=response();
    await expect(createIncidentReport({user:{id:staffId,role:"STAFF",branchId},body:{items:[{inventoryItemId:itemId,quantity:25,enteredUnit:"g"}],incidentType:"SPILLAGE",occurredAt:manilaNoonIso(date),reason:"Coffee beans spilled during transfer."}} as never,missing.res as never,()=>{})).rejects.toMatchObject({code:"LATE_INCIDENT_REASON_REQUIRED"});
    const created=response();
    await createIncidentReport({user:{id:staffId,role:"STAFF",branchId},body:{items:[{inventoryItemId:itemId,quantity:25,enteredUnit:"g"}],incidentType:"SPILLAGE",occurredAt:manilaNoonIso(date),lateReportingReason:"Reported after the closing review was completed.",reason:"Coffee beans spilled during transfer."}} as never,created.res as never,()=>{});
    const incidentId=created.state.body.data.incident.id;
    expect((await pool.query(`SELECT notes,status FROM incident_reports WHERE id=$1`,[incidentId])).rows[0]).toMatchObject({status:"PENDING",notes:expect.stringContaining("Reported after the closing review")});
    const reviewed=response();
    await reviewIncidentReport({user:{id:managerId,role:"BRANCH_MANAGER",branchId},params:{id:incidentId},body:{status:"VERIFIED",managerComment:"Verified against the closing shift evidence."}} as never,reviewed.res as never,()=>{});
    const linked=response();
    await linkIncidentToInvestigation({user:{id:managerId,role:"BRANCH_MANAGER",branchId},params:{id:incidentId},body:{shrinkageReportId:reportId,reason:"Reviewed against closing evidence"}} as never,linked.res as never,()=>{});
    expect((await pool.query(`SELECT count(*)::int count FROM incident_shrinkage_links WHERE incident_report_id=$1 AND shrinkage_report_id=$2`,[incidentId,reportId])).rows[0].count).toBe(1);
    expect((await pool.query(`SELECT recipient_user_id::text recipient,type,entity_id::text "entityId" FROM notifications WHERE type='INCIDENT_REVIEWED' AND entity_id=$1`,[incidentId])).rows[0]).toEqual({recipient:staffId,type:"INCIDENT_REVIEWED",entityId:incidentId});
  });
});
