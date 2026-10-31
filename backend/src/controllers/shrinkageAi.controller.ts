import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { generateGeminiShrinkageAnalysis } from "../services/geminiInsights.service.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { AppError } from "../utils/appError.js";
import { idParams } from "../validators/masterData.js";

type ShrinkageContext = {
  branchId: string;
  branchName: string;
  inventoryItemId: string;
  ingredient: string;
  expectedQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  variancePercent: number | null;
  unit: string;
  classification: "SPOILAGE" | "WASTAGE" | "SPILLAGE" | "DAMAGED_ITEM" | "PREPARATION_ERROR" | "OVERPRODUCTION" | "EXPIRATION" | "UNAUTHORIZED_CONSUMPTION" | "PILFERAGE" | "COUNT_ERROR" | null;
  status: "DETECTED" | "VERIFIED" | "PENDING_REVIEW" | "REVIEWED";
  relatedHistoricalCases: number;
  countType: "OPENING" | "CLOSING" | "FULL";
  intervalStartAt: string | Date | null;
  intervalEndAt: string | Date;
};

const isoTimestamp=(value:string|Date|null)=>value instanceof Date?value.toISOString():value;

export const getShrinkageAiAnalysis: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const branchId = getEffectiveBranchId(req.user!);
  const report = await pool.query<ShrinkageContext>(
    `SELECT sr.branch_id "branchId",b.name "branchName",sr.inventory_item_id "inventoryItemId",ii.name ingredient,
            sr.expected_quantity::float8 "expectedQuantity",sr.actual_quantity::float8 "actualQuantity",
            (sr.actual_quantity-sr.expected_quantity)::float8 "varianceQuantity",
            CASE WHEN sr.expected_quantity>0 THEN (((sr.actual_quantity-sr.expected_quantity)/sr.expected_quantity)*100)::float8 ELSE NULL END "variancePercent",
            sr.unit,sr.classification,sr.status,ic.count_type "countType",
            checkpoint.effective_at "intervalStartAt",COALESCE(ic.effective_at,ic.submitted_at) "intervalEndAt",
            (SELECT count(*)::int FROM shrinkage_reports historical
              JOIN inventory_count_items historical_item ON historical_item.id=historical.inventory_count_item_id
              WHERE historical.id<>sr.id AND historical.branch_id=sr.branch_id
                AND historical.inventory_item_id=sr.inventory_item_id AND NOT historical.is_test_data
                AND historical_item.voided_at IS NULL) "relatedHistoricalCases"
       FROM shrinkage_reports sr
       JOIN inventory_count_items ici ON ici.id=sr.inventory_count_item_id
       JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
       JOIN branches b ON b.id=sr.branch_id
       JOIN inventory_items ii ON ii.id=sr.inventory_item_id
       LEFT JOIN LATERAL (
         SELECT source.effective_at FROM (
           SELECT COALESCE(previous.effective_at,previous.submitted_at) effective_at
             FROM inventory_counts previous
             JOIN inventory_count_items previous_item ON previous_item.inventory_count_id=previous.id
               AND previous_item.inventory_item_id=sr.inventory_item_id AND previous_item.voided_at IS NULL
            WHERE previous.branch_id=sr.branch_id AND NOT previous.is_test_data
              AND COALESCE(previous.effective_at,previous.submitted_at)<COALESCE(ic.effective_at,ic.submitted_at)
              AND ((ic.count_type='OPENING' AND previous.count_type IN ('CLOSING','FULL'))
                OR (ic.count_type='CLOSING' AND previous.count_type='OPENING' AND previous.count_date=ic.count_date)
                OR (ic.count_type='FULL' AND previous.count_type IN ('OPENING','CLOSING','FULL')))
           UNION ALL
           SELECT baseline.effective_at FROM inventory_opening_baselines baseline
           JOIN inventory_opening_baseline_items baseline_item ON baseline_item.opening_baseline_id=baseline.id
             AND baseline_item.inventory_item_id=sr.inventory_item_id
           WHERE ic.count_type='OPENING' AND baseline.branch_id=sr.branch_id
             AND baseline.effective_at<COALESCE(ic.effective_at,ic.submitted_at)
         ) source ORDER BY source.effective_at DESC LIMIT 1
       ) checkpoint ON true
      WHERE sr.id=$1 AND NOT sr.is_test_data AND sr.archived_at IS NULL AND ici.voided_at IS NULL ${branchId ? "AND sr.branch_id=$2" : ""}`,
    branchId ? [id, branchId] : [id],
  );
  const context = report.rows[0];
  if (!context) throw new AppError(404, "SHRINKAGE_REPORT_NOT_FOUND", "Shrinkage report not found");

  const incidents = await pool.query<{ incidentReportId:string; incidentReportItemId:string; incidentType: string; occurredAt:string|Date; quantity: number; unit: string; status: string; matchQuality:"EXACT"|"APPROXIMATE"; quantityDifference:number; evidenceStatus:"UNVERIFIED" }>(
    `SELECT ir.id "incidentReportId",iri.id "incidentReportItemId",ir.incident_type "incidentType",ir.occurred_at "occurredAt",
            iri.quantity::float8,iri.unit,ir.status,
            CASE WHEN abs(iri.quantity-abs($6::numeric))<=0.0001 THEN 'EXACT' ELSE 'APPROXIMATE' END "matchQuality",
            abs(iri.quantity-abs($6::numeric))::float8 "quantityDifference",'UNVERIFIED' "evidenceStatus"
       FROM incident_reports ir
       JOIN incident_report_items iri ON iri.incident_report_id=ir.id
       CROSS JOIN calculation_settings settings
      WHERE ir.branch_id=$2 AND iri.inventory_item_id=$3 AND iri.unit=$7
        AND NOT ir.is_test_data AND ir.archived_at IS NULL AND ir.status IN ('PENDING','VERIFIED')
        AND $4::timestamptz IS NOT NULL AND ir.occurred_at>$4::timestamptz AND ir.occurred_at<=$5::timestamptz
        AND abs(iri.quantity-abs($6::numeric))<=greatest(settings.variance_tolerance_quantity,(abs($6::numeric)*settings.variance_tolerance_percent/100))
        AND (ir.status='VERIFIED' OR NOT EXISTS (SELECT 1 FROM inventory_counts finalized
          WHERE finalized.branch_id=ir.branch_id
            AND finalized.count_date=(ir.occurred_at AT TIME ZONE 'Asia/Manila')::date
            AND finalized.count_type IN ('CLOSING','FULL') AND NOT finalized.is_test_data
            AND finalized.submitted_at<=ir.created_at))
      ORDER BY abs(iri.quantity-abs($6::numeric)),ir.occurred_at DESC LIMIT 5`,
    [id,context.branchId,context.inventoryItemId,context.intervalStartAt,context.intervalEndAt,context.varianceQuantity,context.unit],
  );

  const analysis = await generateGeminiShrinkageAnalysis({
    branch: context.branchName,
    ingredient: context.ingredient,
    expectedQuantity: context.expectedQuantity,
    actualQuantity: context.actualQuantity,
    varianceQuantity: context.varianceQuantity,
    variancePercent: context.variancePercent,
    unit: context.unit,
    materiality: "ABOVE_TOLERANCE",
    status: context.status,
    classification: context.classification,
    relatedHistoricalCases: context.relatedHistoricalCases,
    countType: context.countType,
    countInterval: { startAt: isoTimestamp(context.intervalStartAt), endAt: isoTimestamp(context.intervalEndAt)! },
    candidateIncidents: incidents.rows.map((incident)=>({...incident,occurredAt:isoTimestamp(incident.occurredAt)!})),
  });

  res.json({
    success: true,
    data: {
      source: analysis ? "GOOGLE_GEMINI" : "UNAVAILABLE",
      analysis,
    },
  });
};
