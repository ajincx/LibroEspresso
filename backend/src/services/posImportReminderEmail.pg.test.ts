import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({send:vi.fn()}));
vi.mock("./emailTransport.service.js",()=>({emailDeliveryConfigured:()=>true,sanitizeEmailDeliveryErrorCode:(error:unknown)=>typeof error==="object"&&error&&"code" in error&&error.code==="ETIMEDOUT"?"ETIMEDOUT":"SMTP_DELIVERY_FAILED",sendExternalEmail:mocks.send}));

const databaseUrl=process.env.POS_REMINDER_E2E_DATABASE_URL;
const suite=databaseUrl?describe:describe.skip;

suite("POS import reminder email PostgreSQL lifecycle",()=>{
  let pool:pg.Pool;
  let run:(businessDate:string)=>Promise<{configured:boolean;claimed:number;sent:number;failed:number;suppressed:number}>;
  const businessDate="2026-10-27";

  async function createBranch(code:string,managerCount:number){
    const branchId=randomUUID();
    await pool.query("INSERT INTO branches(id,code,name,location) VALUES($1,$2,$3,'Disposable database')",[branchId,code,`Branch ${code}`]);
    const managers=[];
    for(let index=0;index<managerCount;index+=1){
      const userId=randomUUID();
      await pool.query("INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status,position) VALUES($1,$2,$3,'Manager',$4,$5,'test-hash','BRANCH_MANAGER','ACTIVE',$6)",[userId,branchId,index===0?'Branch':'Assistant',`${code.toLowerCase()}-${index}@example.com`,`${code.toLowerCase()}-${index}`,index===0?'Branch Manager':'Assistant Manager']);
      managers.push(userId);
    }
    const sourceId=randomUUID();
    await pool.query("INSERT INTO pos_sources(id,source_code,display_name,supported_format,status,branch_id,format_verified_by,format_verified_at) VALUES($1,$2,$3,'CANONICAL_CSV','ACTIVE',$4,$5,now())",[sourceId,`SRC-${code}`,`POS ${code}`,branchId,managers[0]]);
    return {branchId,sourceId,managers};
  }

  beforeAll(async()=>{
    if(!databaseUrl)throw new Error("POS_REMINDER_E2E_DATABASE_URL is required");
    const name=decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if(!/^libro_fix12_email_[a-z0-9_]*_e2e$/i.test(name))throw new Error("Refusing to run outside a disposable Fix 12 email database");
    process.env.NODE_ENV="test";process.env.DATA_LIFECYCLE_ENV="DEVELOPMENT";process.env.DATABASE_URL=databaseUrl;process.env.JWT_SECRET="fix12-email-disposable-secret-at-least-32-characters";
    pool=new pg.Pool({connectionString:databaseUrl});
    ({sendMissingPosImportReminderEmails:run}=await import("./posImportReminderEmail.service.js"));
  });
  afterAll(async()=>{if(pool)await pool.end();});

  it("sends once to two same-branch Managers and suppresses a branch with an accepted import",async()=>{
    const missing=await createBranch(`M${randomUUID().slice(0,6)}`,2);
    const imported=await createBranch(`I${randomUUID().slice(0,6)}`,1);
    const testOnly=await createBranch(`T${randomUUID().slice(0,6)}`,1);
    await pool.query("INSERT INTO pos_imports(branch_id,business_date,source_filename,imported_by,completed_at,pos_source_id) VALUES($1,$2,'accepted.csv',$3,now(),$4)",[imported.branchId,businessDate,imported.managers[0],imported.sourceId]);
    await pool.query("INSERT INTO pos_imports(branch_id,business_date,source_filename,imported_by,completed_at,pos_source_id,is_test_data) VALUES($1,$2,'test.csv',$3,now(),$4,true)",[testOnly.branchId,businessDate,testOnly.managers[0],testOnly.sourceId]);
    mocks.send.mockResolvedValue(undefined);
    const concurrent=await Promise.all([run(businessDate),run(businessDate)]);
    expect(concurrent.reduce((total,result)=>total+result.claimed,0)).toBe(3);
    expect(concurrent.reduce((total,result)=>total+result.sent,0)).toBe(3);
    expect(await run(businessDate)).toMatchObject({configured:true,claimed:0,sent:0,failed:0});
    const rows=await pool.query("SELECT branch_id,status,attempt_count FROM pos_import_email_reminders WHERE business_date=$1 ORDER BY branch_id",[businessDate]);
    expect(rows.rows).toHaveLength(3);
    expect(rows.rows.filter(row=>row.branch_id===missing.branchId)).toHaveLength(2);
    expect(rows.rows.filter(row=>row.branch_id===testOnly.branchId)).toHaveLength(1);
    expect(rows.rows.every(row=>row.status==='SENT'&&row.attempt_count===1)).toBe(true);
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      subject:expect.stringContaining("Reminder: Pending POS Sales Import"),
      text:expect.stringContaining("October 27, 2026"),
      html:expect.stringContaining("Open Libro Espresso"),
    }));
  });

  it("retries a failed delivery on the same audit record without creating a duplicate",async()=>{
    const retry=await createBranch(`R${randomUUID().slice(0,6)}`,1);
    mocks.send.mockRejectedValueOnce(Object.assign(new Error("not logged"),{code:"ETIMEDOUT"}));
    expect(await run(businessDate)).toMatchObject({claimed:1,sent:0,failed:1});
    await pool.query("UPDATE pos_import_email_reminders SET next_attempt_at=now()-interval '1 minute' WHERE branch_id=$1",[retry.branchId]);
    mocks.send.mockResolvedValueOnce(undefined);
    expect(await run(businessDate)).toMatchObject({claimed:1,sent:1,failed:0});
    const state=await pool.query<{count:string;status:string;attempt_count:number;failures:string;sent:string}>(`SELECT count(*)::text count,max(status) status,max(attempt_count)::int attempt_count,
      (SELECT count(*) FROM audit_logs WHERE branch_id=$1 AND action='POS_IMPORT_REMINDER_FAILED')::text failures,
      (SELECT count(*) FROM audit_logs WHERE branch_id=$1 AND action='POS_IMPORT_REMINDER_SENT')::text sent
      FROM pos_import_email_reminders WHERE branch_id=$1`,[retry.branchId]);
    expect(state.rows[0]).toMatchObject({count:"1",status:"SENT",attempt_count:2,failures:"1",sent:"1"});
  });
});
