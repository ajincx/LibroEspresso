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
};

export const getShrinkageAiAnalysis: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const branchId = getEffectiveBranchId(req.user!);
  const report = await pool.query<ShrinkageContext>(
    `SELECT sr.branch_id "branchId",b.name "branchName",sr.inventory_item_id "inventoryItemId",ii.name ingredient,
            sr.expected_quantity::float8 "expectedQuantity",sr.actual_quantity::float8 "actualQuantity",
            (sr.actual_quantity-sr.expected_quantity)::float8 "varianceQuantity",
            CASE WHEN sr.expected_quantity>0 THEN (((sr.actual_quantity-sr.expected_quantity)/sr.expected_quantity)*100)::float8 ELSE NULL END "variancePercent",
            sr.unit,sr.classification,sr.status,
            (SELECT count(*)::int FROM shrinkage_reports historical
              WHERE historical.id<>sr.id AND historical.branch_id=sr.branch_id
                AND historical.inventory_item_id=sr.inventory_item_id AND NOT historical.is_test_data
                AND historical.archived_at IS NULL) "relatedHistoricalCases"
       FROM shrinkage_reports sr
       JOIN branches b ON b.id=sr.branch_id
       JOIN inventory_items ii ON ii.id=sr.inventory_item_id
      WHERE sr.id=$1 AND NOT sr.is_test_data AND sr.archived_at IS NULL ${branchId ? "AND sr.branch_id=$2" : ""}`,
    branchId ? [id, branchId] : [id],
  );
  const context = report.rows[0];
  if (!context) throw new AppError(404, "SHRINKAGE_REPORT_NOT_FOUND", "Shrinkage report not found");

  const incidents = await pool.query<{ incidentType: string; quantity: number; unit: string; status: string }>(
    `SELECT ir.incident_type "incidentType",iri.quantity::float8,iri.unit,ir.status
       FROM incident_shrinkage_links link
       JOIN incident_reports ir ON ir.id=link.incident_report_id
       JOIN incident_report_items iri ON iri.id=link.incident_report_item_id
      WHERE link.shrinkage_report_id=$1 AND NOT ir.is_test_data AND ir.archived_at IS NULL
      ORDER BY ir.occurred_at DESC LIMIT 5`,
    [id],
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
    linkedIncidents: incidents.rows,
  });

  res.json({
    success: true,
    data: {
      source: analysis ? "GOOGLE_GEMINI" : "UNAVAILABLE",
      analysis,
    },
  });
};
