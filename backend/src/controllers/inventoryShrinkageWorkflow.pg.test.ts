import pg from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";

const databaseUrl=process.env.PHASE_C_E2E_DATABASE_URL;
const suite=databaseUrl?describe:describe.skip;

suite("Opening to incident evidence Manager review PostgreSQL integration",()=>{
  const runId=crypto.randomUUID().slice(0,8);
  const branchId=crypto.randomUUID();
  const managerId=crypto.randomUUID();
  const staffId=crypto.randomUUID();
  let pool:pg.Pool;
  let inventoryItemId="";
  let unit="";
  let shrinkageReportId="";
  let exactIncidentId="";
  let exactItemId="";
  let approximateIncidentId="";
  let approximateItemId="";
  let submitInventoryCount:Awaited<typeof import("./inventoryWorkflow.controller.js")>["submitInventoryCount"];
  let getShrinkageEvidence:Awaited<typeof import("./inventoryWorkflow.controller.js")>["getShrinkageEvidence"];
  let submitShrinkageInvestigation:Awaited<typeof import("./inventoryWorkflow.controller.js")>["submitShrinkageInvestigation"];
  let linkIncidentToInvestigation:Awaited<typeof import("./operations.controller.js")>["linkIncidentToInvestigation"];
  let decideIncidentEvidence:Awaited<typeof import("./operations.controller.js")>["decideIncidentEvidence"];

  const manilaDate=(offset=0)=>{const date=new Date();date.setUTCDate(date.getUTCDate()+offset);return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);};
  const responseState=()=>{const state:{status:number;body?:any}={status:200};return {state,response:{status(code:number){state.status=code;return this;},json(body:unknown){state.body=body;return this;}}};};
  const managerRequest=(body:unknown,params:Record<string,string>)=>({body,params,user:{id:managerId,role:"BRANCH_MANAGER",branchId}} as never);

  beforeAll(async()=>{
    if(!databaseUrl)throw new Error("PHASE_C_E2E_DATABASE_URL is required");
    const name=decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if(!/^libro_phasec_[a-z0-9_]*e2e$/i.test(name))throw new Error("Refusing non-disposable database");
    process.env.NODE_ENV="test";process.env.DATABASE_URL=databaseUrl;
    pool=new pg.Pool({connectionString:databaseUrl});
    ({submitInventoryCount,getShrinkageEvidence,submitShrinkageInvestigation}=await import("./inventoryWorkflow.controller.js"));
    ({linkIncidentToInvestigation,decideIncidentEvidence}=await import("./operations.controller.js"));
    const item=(await pool.query<{id:string;unit:string}>(`SELECT id,unit FROM inventory_items WHERE status='ACTIVE' ORDER BY sku LIMIT 1`)).rows[0]!;
    inventoryItemId=item.id;unit=item.unit;
    await pool.query(`INSERT INTO branches(id,code,name,location) VALUES($1,$2,$3,'Disposable evidence workflow')`,[branchId,`EVID-${runId}`,`Evidence ${runId}`]);
    await pool.query(`INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status) VALUES
      ($1,$3,'Evidence','Manager',$4,$5,'unused','BRANCH_MANAGER','ACTIVE'),
      ($2,$3,'Evidence','Staff',$6,$7,'unused','STAFF','ACTIVE')`,[managerId,staffId,branchId,`manager-${runId}@e2e.local`,`manager-${runId}`,`staff-${runId}@e2e.local`,`staff-${runId}`]);
    await pool.query(`INSERT INTO branch_inventory_settings(branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,reorder_category,updated_by)
      SELECT $1,$2,unit_cost,0,7,'MEDIUM',$3 FROM inventory_items WHERE id=$2`,[branchId,inventoryItemId,managerId]);
    const prior=(await pool.query<{id:string}>(`INSERT INTO inventory_counts(count_no,branch_id,count_date,submitted_by,count_type,effective_at)
      VALUES($1,$2,$3,$4,'CLOSING',$5::timestamptz) RETURNING id`,[`IC-EVID-${runId}`,branchId,manilaDate(-1),managerId,`${manilaDate(-1)}T20:00:00+08:00`])).rows[0]!;
    await pool.query(`INSERT INTO inventory_count_items(inventory_count_id,inventory_item_id,previous_actual_quantity,expected_quantity,actual_quantity,variance_quantity,variance_value,unit)
      VALUES($1,$2,500,500,500,0,0,$3)`,[prior.id,inventoryItemId,unit]);
    await pool.query(`INSERT INTO branch_inventory_balances(branch_id,inventory_item_id,actual_quantity,as_of) VALUES($1,$2,500,$3::timestamptz)`,[branchId,inventoryItemId,`${manilaDate(-1)}T20:00:00+08:00`]);
  });

  afterAll(async()=>{
    if(!pool)return;
    await pool.query(`DELETE FROM notifications WHERE branch_id=$1`,[branchId]);
    await pool.query(`DELETE FROM audit_logs WHERE user_id IN ($1,$2)`,[managerId,staffId]);
    await pool.query(`DELETE FROM incident_shrinkage_evidence_decisions WHERE shrinkage_report_id IN (SELECT id FROM shrinkage_reports WHERE branch_id=$1)`,[branchId]);
    await pool.query(`DELETE FROM incident_shrinkage_links WHERE shrinkage_report_id IN (SELECT id FROM shrinkage_reports WHERE branch_id=$1)`,[branchId]);
    await pool.query(`DELETE FROM incident_report_items WHERE incident_report_id IN (SELECT id FROM incident_reports WHERE branch_id=$1)`,[branchId]);
    await pool.query(`DELETE FROM incident_reports WHERE branch_id=$1`,[branchId]);
    await pool.query(`DELETE FROM shrinkage_reports WHERE branch_id=$1`,[branchId]);
    await pool.query(`DELETE FROM branch_inventory_balances WHERE branch_id=$1`,[branchId]);
    await pool.query(`DELETE FROM inventory_count_items WHERE inventory_count_id IN (SELECT id FROM inventory_counts WHERE branch_id=$1)`,[branchId]);
    await pool.query(`DELETE FROM inventory_counts WHERE branch_id=$1`,[branchId]);
    await pool.query(`DELETE FROM branch_inventory_settings WHERE branch_id=$1`,[branchId]);
    await pool.query(`DELETE FROM users WHERE id IN ($1,$2)`,[managerId,staffId]);
    await pool.query(`DELETE FROM branches WHERE id=$1`,[branchId]);
    await pool.end();
  });

  it("matches interval evidence and preserves accept, reject, unlink, and separate verification history",async()=>{
    const submitted=responseState();
    await submitInventoryCount(managerRequest({countDate:manilaDate(),countType:"OPENING",items:[{inventoryItemId,quantity:450,enteredUnit:unit}]},{}),submitted.response as never,()=>{});
    expect(submitted.state.status).toBe(201);
    const count=submitted.state.body.data.count;
    shrinkageReportId=count.items[0].shrinkageReportId;
    expect(count.items[0]).toMatchObject({expectedQuantity:500,actualQuantity:450,varianceQuantity:-50});
    expect(shrinkageReportId).toBeTruthy();
    const end=(await pool.query<{endAt:string}>(`SELECT COALESCE(effective_at,submitted_at) "endAt" FROM inventory_counts WHERE id=$1`,[count.id])).rows[0]!.endAt;
    const insertIncident=async(quantity:number,offset:string)=>{
      const incident=(await pool.query<{id:string}>(`INSERT INTO incident_reports(submitted_by,branch_id,inventory_item_id,incident_type,quantity,occurred_at,reason,status)
        VALUES($1,$2,$3,'SPILLAGE',$4,$5::timestamptz+$6::interval,'Reported operational incident','PENDING') RETURNING id`,[staffId,branchId,inventoryItemId,quantity,end,offset])).rows[0]!;
      const item=(await pool.query<{id:string}>(`INSERT INTO incident_report_items(incident_report_id,inventory_item_id,quantity,unit) VALUES($1,$2,$3,$4) RETURNING id`,[incident.id,inventoryItemId,quantity,unit])).rows[0]!;
      return {incidentId:incident.id,itemId:item.id};
    };
    ({incidentId:exactIncidentId,itemId:exactItemId}=await insertIncident(50,"-1 minute"));
    ({incidentId:approximateIncidentId,itemId:approximateItemId}=await insertIncident(49,"-30 seconds"));
    await insertIncident(50,"+1 hour");

    const evidence=responseState();
    await getShrinkageEvidence(managerRequest({}, {id:shrinkageReportId}),evidence.response as never,()=>{});
    expect(evidence.state.body.data.evidence.interval).toMatchObject({countType:"OPENING"});
    expect(evidence.state.body.data.evidence.incidents).toEqual([
      expect.objectContaining({id:exactIncidentId,matchQuality:"EXACT",evidenceStatus:"UNVERIFIED",explicitlyLinked:false}),
      expect.objectContaining({id:approximateIncidentId,matchQuality:"APPROXIMATE",evidenceStatus:"UNVERIFIED",explicitlyLinked:false}),
    ]);

    const acceptExact=()=>linkIncidentToInvestigation(managerRequest({shrinkageReportId,incidentReportItemId:exactItemId,reason:"Quantity and timestamp reviewed"},{id:exactIncidentId}),responseState().response as never,()=>{});
    await acceptExact();
    await acceptExact();
    await Promise.all([acceptExact(),acceptExact()]);
    expect((await pool.query(`SELECT 1 FROM incident_shrinkage_links WHERE incident_report_item_id=$1 AND shrinkage_report_id=$2`,[exactItemId,shrinkageReportId])).rowCount).toBe(1);
    expect((await pool.query(`SELECT 1 FROM incident_shrinkage_evidence_decisions WHERE incident_report_item_id=$1 AND shrinkage_report_id=$2 AND decision='ACCEPTED'`,[exactItemId,shrinkageReportId])).rowCount).toBe(1);
    expect((await pool.query(`SELECT 1 FROM audit_logs WHERE entity_id=$1 AND action='LINK_INCIDENT_EVIDENCE'`,[exactIncidentId])).rowCount).toBe(1);

    const rejectApproximate=()=>decideIncidentEvidence(managerRequest({shrinkageReportId,incidentReportItemId:approximateItemId,decision:"REJECTED",reason:"Operational notes conflict"},{id:approximateIncidentId}),responseState().response as never,()=>{});
    await rejectApproximate();
    await rejectApproximate();
    await Promise.all([rejectApproximate(),rejectApproximate()]);
    expect((await pool.query(`SELECT 1 FROM incident_shrinkage_evidence_decisions WHERE incident_report_item_id=$1 AND shrinkage_report_id=$2 AND decision='REJECTED'`,[approximateItemId,shrinkageReportId])).rowCount).toBe(1);
    expect((await pool.query(`SELECT 1 FROM audit_logs WHERE entity_id=$1 AND action='REJECT_INCIDENT_EVIDENCE'`,[approximateIncidentId])).rowCount).toBe(1);

    const unlinkExact=()=>decideIncidentEvidence(managerRequest({shrinkageReportId,incidentReportItemId:exactItemId,decision:"UNLINKED",reason:"Further review disproved linkage"},{id:exactIncidentId}),responseState().response as never,()=>{});
    await unlinkExact();
    await expect(unlinkExact()).rejects.toMatchObject({code:"INCIDENT_EVIDENCE_NOT_LINKED"});
    await acceptExact();
    const exactDecisions=(await pool.query<{decision:string}>(`SELECT decision FROM incident_shrinkage_evidence_decisions WHERE incident_report_item_id=$1 AND shrinkage_report_id=$2 ORDER BY decided_at,id`,[exactItemId,shrinkageReportId])).rows;
    expect(exactDecisions.map(row=>row.decision)).toEqual(["ACCEPTED","UNLINKED","ACCEPTED"]);
    expect((await pool.query(`SELECT 1 FROM incident_shrinkage_links WHERE incident_report_item_id=$1 AND shrinkage_report_id=$2`,[exactItemId,shrinkageReportId])).rowCount).toBe(1);

    const crossBranchRequest={body:{shrinkageReportId,incidentReportItemId:approximateItemId,decision:"REJECTED",reason:"Cross-branch attempt"},params:{id:approximateIncidentId},user:{id:managerId,role:"BRANCH_MANAGER",branchId:crypto.randomUUID()}} as never;
    await expect(decideIncidentEvidence(crossBranchRequest,responseState().response as never,()=>{})).rejects.toMatchObject({code:"INCIDENT_EVIDENCE_DECISION_INVALID"});

    const rollbackCandidate=await insertIncident(48,"-15 seconds");
    const failFunction=`fail_evidence_${runId}`;
    await pool.query(`CREATE FUNCTION ${failFunction}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='Force rollback after link creation' THEN RAISE EXCEPTION 'forced evidence decision failure'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER ${failFunction} BEFORE INSERT ON incident_shrinkage_evidence_decisions FOR EACH ROW EXECUTE FUNCTION ${failFunction}()`);
    try {
      await expect(linkIncidentToInvestigation(managerRequest({shrinkageReportId,incidentReportItemId:rollbackCandidate.itemId,reason:"Force rollback after link creation"},{id:rollbackCandidate.incidentId}),responseState().response as never,()=>{})).rejects.toThrow("forced evidence decision failure");
    } finally {
      await pool.query(`DROP TRIGGER ${failFunction} ON incident_shrinkage_evidence_decisions`);
      await pool.query(`DROP FUNCTION ${failFunction}()`);
    }
    expect((await pool.query(`SELECT 1 FROM incident_shrinkage_links WHERE incident_report_item_id=$1 AND shrinkage_report_id=$2`,[rollbackCandidate.itemId,shrinkageReportId])).rowCount).toBe(0);
    expect((await pool.query(`SELECT 1 FROM incident_shrinkage_evidence_decisions WHERE incident_report_item_id=$1 AND shrinkage_report_id=$2`,[rollbackCandidate.itemId,shrinkageReportId])).rowCount).toBe(0);
    expect((await pool.query(`SELECT 1 FROM audit_logs WHERE entity_id=$1 AND action='LINK_INCIDENT_EVIDENCE'`,[rollbackCandidate.incidentId])).rowCount).toBe(0);

    const decisions=(await pool.query<{decision:string;reason:string}>(`SELECT decision,reason FROM incident_shrinkage_evidence_decisions WHERE shrinkage_report_id=$1 ORDER BY decided_at,id`,[shrinkageReportId])).rows;
    expect(decisions.map(row=>row.decision)).toEqual(["ACCEPTED","REJECTED","UNLINKED","ACCEPTED"]);
    expect(decisions.every(row=>row.reason.length>=3)).toBe(true);

    await submitShrinkageInvestigation(managerRequest({classification:"COUNT_ERROR",explanation:"Count procedure reviewed separately",evidenceReviewConfirmed:false,evidenceBasis:[]},{id:shrinkageReportId}),responseState().response as never,()=>{});
    await expect(decideIncidentEvidence(managerRequest({shrinkageReportId,incidentReportItemId:approximateItemId,decision:"REJECTED",reason:"Attempt after lock"},{id:approximateIncidentId}),responseState().response as never,()=>{})).rejects.toMatchObject({code:"INCIDENT_EVIDENCE_DECISION_INVALID"});
    await expect(acceptExact()).rejects.toMatchObject({code:"INCIDENT_LINK_INVALID"});
    expect((await pool.query<{status:string;classification:string}>(`SELECT status,classification FROM shrinkage_reports WHERE id=$1`,[shrinkageReportId])).rows[0]).toMatchObject({status:"VERIFIED",classification:"COUNT_ERROR"});
  });
});
