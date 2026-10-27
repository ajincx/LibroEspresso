import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import pg from "pg";
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";

const emailMocks=vi.hoisted(()=>({send:vi.fn()}));
vi.mock("./emailTransport.service.js",()=>({emailDeliveryConfigured:()=>true,sendExternalEmail:emailMocks.send}));

const databaseUrl=process.env.PASSWORD_RESET_E2E_DATABASE_URL;
const suite=databaseUrl?describe:describe.skip;

suite("password reset PostgreSQL lifecycle",()=>{
  let pool:pg.Pool;let userId="";let branchId="";let resetEmail="";let token="";let consumePasswordReset:(token:string,password:string,now?:Date)=>Promise<void>;let requestPasswordReset:(email:string,context:{ipAddress?:string|null;userAgent?:string|null},now?:Date)=>Promise<{deliveryConfigured:boolean}>;let authenticateCredentials:(identifier:string,password:string,context?:{ipAddress?:string|null;userAgent?:string|null})=>Promise<{user:{id:string}}>;
  beforeAll(async()=>{
    if(!databaseUrl)throw new Error("PASSWORD_RESET_E2E_DATABASE_URL is required");
    const name=decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if(!/^libro_(?:phase3fix12|fix12_email)_[a-z0-9_]*_e2e$/i.test(name))throw new Error("Refusing to run outside a disposable Phase 3 Fix 12 database");
    process.env.NODE_ENV="test";process.env.DATA_LIFECYCLE_ENV="DEVELOPMENT";process.env.DATABASE_URL=databaseUrl;process.env.JWT_SECRET="phase3-fix12-disposable-secret-at-least-32-characters";process.env.SMTP_HOST="smtp.gmail.com";process.env.SMTP_PORT="465";process.env.SMTP_SECURE="true";process.env.SMTP_USER="test-sender@example.com";process.env.SMTP_APP_PASSWORD="abcdefghijklmnop";process.env.SMTP_FROM="test-sender@example.com";process.env.PASSWORD_RESET_URL_BASE="https://libro-espresso.vercel.app/reset-password";
    pool=new pg.Pool({connectionString:databaseUrl});({consumePasswordReset,requestPasswordReset}=await import("./passwordReset.service.js"));({authenticateCredentials}=await import("./auth.service.js"));
    branchId=randomUUID();userId=randomUUID();resetEmail=`reset-${userId}@example.com`;token=createHash("sha256").update(userId).digest("hex");const originalHash=await bcrypt.hash("Original-password-123",12);
    await pool.query("INSERT INTO branches(id,code,name,location) VALUES($1,$2,'Reset Test Branch','Disposable database')",[branchId,`R-${branchId.slice(0,8)}`]);
    await pool.query("INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status) VALUES($1,$2,'Reset','Manager',$3,$4,$5,'BRANCH_MANAGER','ACTIVE')",[userId,branchId,resetEmail,`reset-${userId}`,originalHash]);
    await pool.query("INSERT INTO auth_sessions(user_id,session_identifier_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",[userId,createHash("sha256").update(`session-${userId}`).digest("hex")]);
    await pool.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[userId,createHash("sha256").update(token).digest("hex")]);
  });
  beforeEach(()=>emailMocks.send.mockReset());
  afterAll(async()=>{if(pool)await pool.end();});
  it("consumes one token once, updates the hash, revokes sessions, and records an audit",async()=>{
    const results=await Promise.allSettled([consumePasswordReset(token,"Replacement-password-456"),consumePasswordReset(token,"Replacement-password-456")]);
    if(results.every(result=>result.status==="rejected")) throw new Error(results.map(result=>result.status==="rejected"?String(result.reason):"fulfilled").join(" | "));
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);
    const state=await pool.query<{password_hash:string;tokens:string;sessions:string;audits:string}>(`SELECT u.password_hash,(SELECT count(*) FROM password_reset_tokens WHERE user_id=u.id AND consumed_at IS NOT NULL)::text tokens,(SELECT count(*) FROM auth_sessions WHERE user_id=u.id AND revoked_at IS NOT NULL)::text sessions,(SELECT count(*) FROM audit_logs WHERE user_id=u.id AND action='PASSWORD_RESET')::text audits FROM users u WHERE u.id=$1`,[userId]);
    expect(await bcrypt.compare("Replacement-password-456",state.rows[0]!.password_hash)).toBe(true);expect(await bcrypt.compare("Original-password-123",state.rows[0]!.password_hash)).toBe(false);expect(state.rows[0]).toMatchObject({tokens:"1",sessions:"1",audits:"1"});
    expect((await authenticateCredentials(resetEmail,"Replacement-password-456",{})).user.id).toBe(userId);
    await expect(authenticateCredentials(resetEmail,"Original-password-123",{})).rejects.toMatchObject({code:"INVALID_PASSWORD"});
  });
  it("rejects expired tokens and tokens belonging to inactive accounts",async()=>{
    const expired="expired-token";await pool.query("INSERT INTO password_reset_tokens(user_id,token_hash,created_at,expires_at) VALUES($1,$2,now()-interval '2 hours',now()-interval '1 hour')",[userId,createHash("sha256").update(expired).digest("hex")]);
    await expect(consumePasswordReset(expired,"Never-applied-password-789")).rejects.toMatchObject({code:"PASSWORD_RESET_INVALID"});
    const inactive="inactive-token";await pool.query("UPDATE users SET status='INACTIVE' WHERE id=$1",[userId]);await pool.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[userId,createHash("sha256").update(inactive).digest("hex")]);
    await expect(consumePasswordReset(inactive,"Never-applied-password-789")).rejects.toMatchObject({code:"PASSWORD_RESET_INVALID"});
    await pool.query("UPDATE users SET status='ACTIVE' WHERE id=$1",[userId]);
  });
  it("stores only the token hash, awaits SMTP, and treats inactive accounts generically",async()=>{
    const requestUser=randomUUID();const email=`delivery-${requestUser}@example.com`;
    await pool.query("INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status) VALUES($1,$2,'Delivery','Manager',$3,$4,'test-hash','BRANCH_MANAGER','ACTIVE')",[requestUser,branchId,email,`delivery-${requestUser}`]);
    emailMocks.send.mockResolvedValueOnce(undefined);
    expect(await requestPasswordReset(email,{ipAddress:"127.0.0.1",userAgent:"test"})).toEqual({deliveryConfigured:true});
    const message=emailMocks.send.mock.calls[0]?.[0] as {text:string};const rawToken=new URL(message.text.match(/https:\/\/\S+/)?.[0]??"").searchParams.get("token");
    expect(rawToken).toBeTruthy();
    const stored=await pool.query<{token_hash:string;consumed_at:string|null}>("SELECT token_hash,consumed_at FROM password_reset_tokens WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",[requestUser]);
    expect(stored.rows[0]?.token_hash).toBe(createHash("sha256").update(rawToken!).digest("hex"));expect(stored.rows[0]?.token_hash).not.toBe(rawToken);expect(stored.rows[0]?.consumed_at).toBeNull();
    await pool.query("UPDATE users SET status='INACTIVE' WHERE id=$1",[requestUser]);emailMocks.send.mockClear();
    expect(await requestPasswordReset(email,{})).toEqual({deliveryConfigured:true});expect(emailMocks.send).not.toHaveBeenCalled();
  });
  it("invalidates a newly issued token when SMTP delivery fails",async()=>{
    const requestUser=randomUUID();const email=`failure-${requestUser}@example.com`;
    await pool.query("INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status) VALUES($1,$2,'Failure','Manager',$3,$4,'test-hash','BRANCH_MANAGER','ACTIVE')",[requestUser,branchId,email,`failure-${requestUser}`]);
    emailMocks.send.mockRejectedValueOnce(Object.assign(new Error("not logged"),{code:"EAUTH"}));
    await expect(requestPasswordReset(email,{})).rejects.toMatchObject({code:"EAUTH"});
    const stored=await pool.query<{consumed_at:string|null}>("SELECT consumed_at FROM password_reset_tokens WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",[requestUser]);expect(stored.rows[0]?.consumed_at).not.toBeNull();
  });
});
