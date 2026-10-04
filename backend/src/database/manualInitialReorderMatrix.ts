import type { ReorderCategory } from "../services/branchInventorySettings.service.js";

export const MANUAL_INITIAL_CONFIGURATION_REASON =
  "Approved manual initial configuration based on ingredient type, canonical unit, practical replenishment quantity, and provisional branch stocking tier; not derived from historical demand.";

export const REORDER_BRANCH_CODES = ["GLD", "LPA", "TAG", "EVO", "VRM"] as const;
export type ReorderBranchCode = (typeof REORDER_BRANCH_CODES)[number];

type Levels = Record<ReorderBranchCode, number>;
export interface ManualInitialReorderRow {
  sku: string;
  category: ReorderCategory;
  coverageDays: number;
  levels: Levels;
}

const levels = (GLD: number, LPA: number, TAG: number, EVO: number, VRM: number): Levels => ({ GLD, LPA, TAG, EVO, VRM });
const row = (sku: string, category: ReorderCategory, coverageDays: number, values: Levels): ManualInitialReorderRow => ({ sku, category, coverageDays, levels: values });

export const MANUAL_INITIAL_REORDER_MATRIX: readonly ManualInitialReorderRow[] = [
  row("ING-00001", "FAST", 5, levels(500, 400, 400, 350, 300)),
  row("ING-00002", "FAST", 5, levels(500, 400, 400, 350, 300)),
  row("ING-00003", "MEDIUM", 7, levels(1500, 1200, 1100, 1000, 1000)),
  row("ING-00004", "FAST", 5, levels(1000, 800, 750, 750, 650)),
  row("ING-00005", "MEDIUM", 7, levels(250, 200, 200, 200, 150)),
  row("ING-00006", "SLOW", 14, levels(100, 100, 100, 100, 100)),
  row("ING-00007", "SLOW", 14, levels(50, 50, 50, 50, 50)),
  row("ING-00008", "MEDIUM", 7, levels(12, 12, 12, 12, 6)),
  row("ING-00009", "MEDIUM", 7, levels(6, 6, 6, 6, 6)),
  row("ING-00010", "MEDIUM", 7, levels(250, 200, 200, 200, 150)),
  row("ING-00011", "MEDIUM", 7, levels(500, 400, 400, 350, 300)),
  row("ING-00012", "MEDIUM", 7, levels(500, 400, 400, 350, 300)),
  row("ING-00013", "MEDIUM", 7, levels(12, 12, 12, 12, 6)),
  row("ING-00014", "SLOW", 14, levels(100, 100, 100, 100, 100)),
  row("ING-00015", "SLOW", 14, levels(100, 100, 100, 100, 100)),
  row("ING-00016", "MEDIUM", 7, levels(250, 200, 200, 200, 150)),
  row("ING-00017", "MEDIUM", 7, levels(250, 200, 200, 200, 150)),
  row("ING-00018", "FAST", 5, levels(10000, 8000, 7500, 7000, 6500)),
  row("ING-00019", "FAST", 5, levels(500, 400, 400, 350, 300)),
  row("ING-00020", "FAST", 5, levels(500, 400, 400, 350, 300)),
  row("ING-00021", "SLOW", 14, levels(100, 100, 100, 100, 100)),
  row("ING-00022", "SLOW", 14, levels(6, 6, 6, 6, 6)),
  row("ING-00023", "SLOW", 14, levels(6, 6, 6, 6, 6)),
  row("ING-00024", "SLOW", 14, levels(6, 6, 6, 6, 6)),
  row("ING-00025", "FAST", 5, levels(250, 200, 200, 200, 150)),
  row("ING-00026", "SLOW", 14, levels(250, 200, 200, 200, 150)),
  row("ING-00027", "FAST", 5, levels(500, 400, 400, 350, 300)),
  row("ING-00028", "SLOW", 14, levels(250, 200, 200, 200, 150)),
  row("ING-00029", "SLOW", 14, levels(6, 6, 6, 6, 6)),
  row("ING-00030", "FAST", 5, levels(250, 200, 200, 200, 150)),
  row("ING-00031", "FAST", 5, levels(3000, 2500, 2250, 2000, 2000)),
  row("ING-00032", "FAST", 5, levels(500, 400, 400, 350, 300)),
  row("ING-00033", "FAST", 5, levels(500, 400, 400, 350, 300)),
  row("ING-00034", "MEDIUM", 7, levels(750, 600, 550, 500, 500)),
  row("ING-00035", "MEDIUM", 7, levels(250, 200, 200, 200, 150)),
  row("ING-00036", "MEDIUM", 7, levels(500, 400, 400, 350, 300)),
  row("ING-00037", "MEDIUM", 7, levels(6, 6, 6, 6, 6)),
  row("ING-00038", "MEDIUM", 7, levels(500, 400, 400, 350, 300)),
  row("ING-00039", "MEDIUM", 7, levels(500, 400, 400, 350, 300)),
  row("ING-00040", "SLOW", 14, levels(250, 200, 200, 200, 150)),
  row("ING-00041", "MEDIUM", 7, levels(500, 400, 400, 350, 300)),
  row("ING-00042", "MEDIUM", 7, levels(1500, 1200, 1100, 1000, 1000)),
  row("ING-00043", "MEDIUM", 7, levels(500, 400, 400, 350, 300)),
  row("ING-00044", "MEDIUM", 7, levels(12, 12, 12, 12, 6)),
  row("ING-00045", "MEDIUM", 7, levels(6, 6, 6, 6, 6)),
  row("ING-00046", "MEDIUM", 7, levels(6, 6, 6, 6, 6)),
  row("ING-00047", "SLOW", 14, levels(100, 100, 100, 100, 100)),
  row("ING-00048", "MEDIUM", 7, levels(500, 400, 400, 350, 300)),
  row("ING-00049", "SLOW", 14, levels(250, 200, 200, 200, 150)),
  row("ING-00050", "MEDIUM", 7, levels(250, 200, 200, 200, 150)),
  row("ING-00051", "SLOW", 14, levels(50, 50, 50, 50, 50)),
  row("ING-00052", "MEDIUM", 7, levels(6, 6, 6, 6, 6)),
  row("ING-00053", "MEDIUM", 7, levels(12, 12, 12, 12, 6)),
  row("ING-00054", "SLOW", 14, levels(6, 6, 6, 6, 6)),
  row("ING-00055", "SLOW", 14, levels(500, 400, 400, 350, 300)),
  row("ING-00056", "MEDIUM", 7, levels(500, 400, 400, 350, 300)),
  row("ING-00057", "MEDIUM", 7, levels(24, 18, 18, 18, 12)),
  row("ING-00058", "MEDIUM", 7, levels(500, 400, 400, 350, 300)),
  row("ING-00059", "MEDIUM", 7, levels(500, 400, 400, 350, 300)),
  row("ING-00060", "SLOW", 14, levels(1000, 800, 750, 750, 650)),
  row("ING-00061", "MEDIUM", 7, levels(250, 200, 200, 200, 150)),
  row("ING-00062", "MEDIUM", 7, levels(250, 200, 200, 200, 150)),
  row("ING-00063", "SLOW", 14, levels(500, 400, 400, 350, 300)),
  row("ING-00064", "SLOW", 14, levels(250, 200, 200, 200, 150)),
  row("ING-00065", "SLOW", 14, levels(500, 400, 400, 350, 300)),
  row("ING-00066", "SLOW", 14, levels(100, 100, 100, 100, 100)),
  row("ING-00067", "SLOW", 14, levels(500, 400, 400, 350, 300)),
  row("ING-00068", "SLOW", 14, levels(250, 200, 200, 200, 150)),
  row("ING-00069", "SLOW", 14, levels(50, 50, 50, 50, 50)),
  row("ING-00070", "SLOW", 14, levels(250, 200, 200, 200, 150)),
  row("ING-00071", "MEDIUM", 7, levels(250, 200, 200, 200, 150)),
  row("RM-001", "FAST", 5, levels(8000, 6500, 6000, 5500, 5000)),
  row("RM-002", "FAST", 5, levels(1500, 1200, 1100, 1000, 1000)),
  row("RM-003", "FAST", 5, levels(500, 400, 400, 350, 300)),
  row("RM-005", "FAST", 5, levels(500, 400, 400, 350, 300)),
  row("RM-006", "FAST", 5, levels(5000, 4000, 3750, 3500, 3250)),
] as const;
