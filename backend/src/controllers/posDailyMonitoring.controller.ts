import type { RequestHandler } from "express";
import { z } from "zod";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { manilaBusinessDate } from "../services/businessTime.service.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { resolveDailyPosStatus } from "../services/posDailyMonitoring.service.js";
import { AppError } from "../utils/appError.js";

const dateInput=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const declarationInput=z.object({businessDate:dateInput,notes:z.string().trim().max(500).optional()});
const monitoringQueryInput=z.object({
  businessDate:dateInput.optional(),
  startDate:dateInput.optional(),
  endDate:dateInput.optional(),
  branchId:z.string().uuid().optional(),
}).superRefine((value,context)=>{
  const start=value.businessDate??value.startDate;
  const end=value.businessDate??value.endDate;
  if(start&&end&&start>end)context.addIssue({code:"custom",message:"Start date must not be after end date."});
  if(start&&end&&(Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400000>62){
    context.addIssue({code:"custom",message:"Daily POS monitoring is limited to 63 days per request."});
  }
});

function manilaMinuteOfDay(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Manila",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  return Number(parts.find((part)=>part.type==="hour")?.value??0)*60+Number(parts.find((part)=>part.type==="minute")?.value??0);
}

type StatusRow={businessDate:string;branchId:string;branchName:string;posSourceId:string|null;posSourceName:string|null;sourceCode:string|null;configuredForDate:boolean;importId:string|null;sourceFilename:string|null;importedAt:string|null;uploadedBy:string|null;closed:boolean};

async function loadStatusRows(startDate:string,endDate:string,branchId:string|null){
  const result=await pool.query<StatusRow>(`WITH dates AS (
      SELECT generate_series($1::date,$2::date,interval '1 day')::date business_date
    )
    SELECT dates.business_date::text "businessDate",b.id "branchId",b.name "branchName",source.id "posSourceId",source.display_name "posSourceName",source.source_code "sourceCode",
      coalesce((source.created_at AT TIME ZONE 'Asia/Manila')::date<=dates.business_date,false) "configuredForDate",
      imported.id "importId",imported.source_filename "sourceFilename",imported.imported_at "importedAt",imported.uploaded_by "uploadedBy",(closed.id IS NOT NULL) closed
    FROM branches b CROSS JOIN dates
    LEFT JOIN pos_sources source ON source.branch_id=b.id AND source.status='ACTIVE'
    LEFT JOIN LATERAL (SELECT pi.id,pi.source_filename,pi.imported_at,concat_ws(' ',u.first_name,u.last_name) uploaded_by FROM pos_imports pi
      LEFT JOIN users u ON u.id=pi.imported_by
      WHERE pi.branch_id=b.id AND pi.pos_source_id=source.id AND pi.business_date=dates.business_date AND pi.completed_at IS NOT NULL
      ORDER BY pi.imported_at ASC LIMIT 1) imported ON true
    LEFT JOIN pos_daily_declarations closed ON closed.branch_id=b.id AND closed.business_date=dates.business_date
    WHERE b.status='ACTIVE' AND ($3::uuid IS NULL OR b.id=$3)
    ORDER BY dates.business_date DESC,b.name,source.display_name`,[startDate,endDate,branchId]);
  return result.rows;
}

export const listDailyPosStatus:RequestHandler=async(req,res)=>{
  const input=monitoringQueryInput.parse(req.query);
  const today=manilaBusinessDate();
  const startDate=input.businessDate??input.startDate??today;
  const endDate=input.businessDate??input.endDate??today;
  const scopedBranch=getEffectiveBranchId(req.user!,input.branchId)??null;
  const rows=(await loadStatusRows(startDate,endDate,scopedBranch)).map((row)=>({...row,status:resolveDailyPosStatus({
    businessDate:row.businessDate,today,hasConfiguredSource:Boolean(row.posSourceId)&&(row.configuredForDate||Boolean(row.importId)),hasImport:Boolean(row.importId),importedAt:row.importedAt,closed:row.closed,
  })}));
  res.json({success:true,data:{startDate,endDate,reminderTime:`${String(env.POS_REMINDER_HOUR_MANILA).padStart(2,"0")}:${String(env.POS_REMINDER_MINUTE_MANILA).padStart(2,"0")}`,statuses:rows}});
};

export const declareClosedPosDay:RequestHandler=async(req,res)=>{
  const input=declarationInput.parse(req.body);
  const branchId=req.user!.branchId;
  if(!branchId)throw new AppError(403,"BRANCH_REQUIRED","A Branch Manager must be assigned to a branch.");
  if(input.businessDate>manilaBusinessDate())throw new AppError(422,"POS_DATE_INVALID","A future date cannot be declared closed.");
  const imported=await pool.query(`SELECT id FROM pos_imports WHERE branch_id=$1 AND business_date=$2::date LIMIT 1`,[branchId,input.businessDate]);
  if(imported.rows[0])throw new AppError(409,"POS_DAY_ALREADY_IMPORTED","Sales were already imported for this business date.");
  const result=await pool.query(`INSERT INTO pos_daily_declarations(branch_id,business_date,declaration,notes,declared_by)
    VALUES($1,$2,'NO_SALES_CLOSED',$3,$4)
    ON CONFLICT(branch_id,business_date) DO UPDATE SET declaration='NO_SALES_CLOSED',notes=excluded.notes,declared_by=excluded.declared_by,created_at=now()
    RETURNING id,business_date "businessDate",declaration,notes`,[branchId,input.businessDate,input.notes??null,req.user!.id]);
  res.status(201).json({success:true,data:{declaration:result.rows[0]}});
};

export async function runDailyPosReminderJob(now=new Date()){
  const today=manilaBusinessDate(now);
  const minute=manilaMinuteOfDay(now);
  const cutoff=env.POS_REMINDER_HOUR_MANILA*60+env.POS_REMINDER_MINUTE_MANILA;
  if(minute<cutoff)return {created:0};
  const result=await pool.query(`INSERT INTO notifications(recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
    SELECT manager.id,b.id,'POS_DAILY_REMINDER','Daily POS sales upload pending',
      'Sales for '||$1::date::text||' have not been uploaded for '||source.display_name||'. Import the sales file or record a valid no-sales/closed day.',
      'POS_SOURCE',source.id
    FROM branches b JOIN pos_sources source ON source.branch_id=b.id AND source.status='ACTIVE'
    JOIN users manager ON manager.branch_id=b.id AND manager.role='BRANCH_MANAGER' AND manager.status='ACTIVE'
    WHERE b.status='ACTIVE'
      AND NOT EXISTS(SELECT 1 FROM pos_imports pi WHERE pi.branch_id=b.id AND pi.pos_source_id=source.id AND pi.business_date=$1::date)
      AND NOT EXISTS(SELECT 1 FROM pos_daily_declarations declaration WHERE declaration.branch_id=b.id AND declaration.business_date=$1::date)
      AND NOT EXISTS(SELECT 1 FROM notifications existing WHERE existing.recipient_user_id=manager.id AND existing.branch_id=b.id
        AND existing.type='POS_DAILY_REMINDER' AND existing.entity_type='POS_SOURCE' AND existing.entity_id=source.id
        AND existing.message LIKE '%'||$1::date::text||'%')
    RETURNING id`,[today]);
  return {created:result.rowCount??0};
}

export const runDailyPosReminderCron:RequestHandler=async(req,res)=>{
  if(!env.CRON_SECRET||req.get("authorization")!==`Bearer ${env.CRON_SECRET}`){
    throw new AppError(401,"CRON_UNAUTHORIZED","Cron authorization failed.");
  }
  const result=await runDailyPosReminderJob();
  res.json({success:true,data:result});
};
