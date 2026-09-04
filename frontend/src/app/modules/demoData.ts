import { C } from "../components/ModuleUi";

export const salesTrend = [
  { date: "Aug 19", sales: 38200, cogs: 16400, gp: 21800 },
  { date: "Aug 20", sales: 41500, cogs: 17800, gp: 23700 },
  { date: "Aug 21", sales: 44200, cogs: 18900, gp: 25300 },
  { date: "Aug 22", sales: 39800, cogs: 17100, gp: 22700 },
  { date: "Aug 23", sales: 46100, cogs: 19800, gp: 26300 },
  { date: "Aug 24", sales: 52400, cogs: 22500, gp: 29900 },
  { date: "Aug 25", sales: 48700, cogs: 20900, gp: 27800 },
];

// Presentation data for the Manager Dashboard's default "Today" view.
// Multiple time points keep both Sales and COGS trend lines visible.
export const managerTodaySalesTrend = [
  { date: "8 AM", sales: 4200, cogs: 1800 },
  { date: "10 AM", sales: 7800, cogs: 3350 },
  { date: "12 PM", sales: 13600, cogs: 5750 },
  { date: "2 PM", sales: 18400, cogs: 7900 },
  { date: "4 PM", sales: 25300, cogs: 10800 },
  { date: "6 PM", sales: 32700, cogs: 13900 },
  { date: "8 PM", sales: 38900, cogs: 16500 },
];

export const kpiSparklines: Record<string, number[]> = {
  sales: [850, 890, 920, 880, 960, 1020, 1120],
  cogs: [380, 400, 415, 395, 430, 458, 482],
  profit: [470, 490, 505, 485, 530, 562, 638],
  inventory: [320, 318, 315, 320, 316, 314, 312],
  shrinkage: [14, 15, 16, 17, 16, 17, 18],
};

export const branchPerf = [
  { branch: "Gulod", sales: 285400, cogs: 122500, margin: 57.1, shrinkage: 4200 },
  { branch: "Lipa", sales: 241800, cogs: 103800, margin: 57.1, shrinkage: 3600 },
  { branch: "Vermosa", sales: 198700, cogs: 85300, margin: 57.1, shrinkage: 5100 },
  { branch: "Tagaytay", sales: 221500, cogs: 95100, margin: 57.0, shrinkage: 2900 },
  { branch: "Evo", sales: 173100, cogs: 74300, margin: 57.1, shrinkage: 2650 },
];

export const shrinkageBreakdown = [
  { name: "Spoilage", value: 7840, pct: 42.5, color: C.amber },
  { name: "Wastage", value: 5920, pct: 32.1, color: C.blue },
  { name: "Potential Pilferage", value: 4690, pct: 25.4, color: C.red },
];

export const inventoryStatus = [
  { name: "Healthy", value: 178, color: C.green },
  { name: "Low Stock", value: 34, color: C.amber },
  { name: "Critical", value: 12, color: C.red },
  { name: "Out of Stock", value: 4, color: C.deepMaroon },
];

export const inventoryItems = [
  { sku: "RM-001", name: "Whole Milk", cat: "Dairy", onHand: 45, unit: "L", unitCost: 140, value: 6300, reorder: 60, status: "low", lastCount: "Aug 25" },
  { sku: "RM-002", name: "Arabica Coffee Beans", cat: "Coffee", onHand: 12, unit: "kg", unitCost: 760, value: 9120, reorder: 20, status: "critical", lastCount: "Aug 25" },
  { sku: "RM-003", name: "Almond Milk", cat: "Dairy Alt", onHand: 68, unit: "L", unitCost: 190, value: 12920, reorder: 40, status: "healthy", lastCount: "Aug 25" },
  { sku: "RM-004", name: "Croissants", cat: "Bakery", onHand: 24, unit: "pcs", unitCost: 85, value: 2040, reorder: 30, status: "low", lastCount: "Aug 24" },
  { sku: "RM-005", name: "Butter", cat: "Dairy", onHand: 0, unit: "kg", unitCost: 420, value: 0, reorder: 10, status: "out", lastCount: "Aug 24" },
  { sku: "RM-006", name: "Espresso Blend Beans", cat: "Coffee", onHand: 28, unit: "kg", unitCost: 820, value: 22960, reorder: 25, status: "healthy", lastCount: "Aug 25" },
  { sku: "RM-007", name: "Oat Milk", cat: "Dairy Alt", onHand: 52, unit: "L", unitCost: 210, value: 10920, reorder: 35, status: "healthy", lastCount: "Aug 25" },
  { sku: "RM-008", name: "White Sugar", cat: "Sweeteners", onHand: 8, unit: "kg", unitCost: 90, value: 720, reorder: 15, status: "critical", lastCount: "Aug 25" },
];

export const varianceRows = [
  { sku: "RM-001", item: "Whole Milk", expected: 120, actual: 108, unit: "L", variance: -12, pct: -10.0, value: -1680, classification: "Needs Review", status: "needs_review" },
  { sku: "RM-002", item: "Arabica Beans", expected: 45, actual: 38, unit: "kg", variance: -7, pct: -15.6, value: -5320, classification: "Investigation Required", status: "investigation" },
  { sku: "RM-003", item: "Almond Milk", expected: 80, actual: 82, unit: "L", variance: 2, pct: 2.5, value: 280, classification: "Excess", status: "matched" },
  { sku: "RM-004", item: "Croissants", expected: 60, actual: 55, unit: "pcs", variance: -5, pct: -8.3, value: -750, classification: "Explained (Wastage)", status: "explained" },
  { sku: "RM-005", item: "Butter", expected: 24, actual: 24, unit: "kg", variance: 0, pct: 0, value: 0, classification: "Matched", status: "matched" },
  { sku: "RM-006", item: "Sugar", expected: 36, actual: 34, unit: "kg", variance: -2, pct: -5.6, value: -180, classification: "Needs Review", status: "needs_review" },
];

export const shrinkageRows = [
  { date: "Aug 25", sku: "RM-001", item: "Whole Milk", branch: "Lipa", expected: 120, actual: 108, variance: -12, classification: "Spoilage", value: 1680, reason: "Temperature issue", recordedBy: "M. Santos", status: "Recorded" },
  { date: "Aug 25", sku: "RM-002", item: "Arabica Beans", branch: "Vermosa", expected: 45, actual: 38, variance: -7, classification: "Potential Pilferage", value: 5320, reason: "Unexplained after reconciliation", recordedBy: "System", status: "Investigation Required" },
  { date: "Aug 24", sku: "RM-004", item: "Croissants", branch: "Lipa", expected: 60, actual: 55, variance: -5, classification: "Wastage", value: 425, reason: "Overproduction", recordedBy: "M. Santos", status: "Recorded" },
  { date: "Aug 24", sku: "RM-008", item: "White Sugar", branch: "Gulod", expected: 36, actual: 33, variance: -3, classification: "Wastage", value: 270, reason: "Spillage during prep", recordedBy: "A. Reyes", status: "Recorded" },
  { date: "Aug 23", sku: "RM-003", item: "Almond Milk", branch: "Tagaytay", expected: 80, actual: 77, variance: -3, classification: "Spoilage", value: 570, reason: "Expired stock", recordedBy: "J. Lim", status: "Recorded" },
];

export const purchaseOrders = [
  { id: "PR-2026-0042", branch: "Lipa", supplier: "Metro Dairy Supply", date: "Aug 25, 2026", items: 6, total: 28400, status: "pending", requestedBy: "Maria Santos", aiMatch: true },
  { id: "PR-2026-0041", branch: "Vermosa", supplier: "PH Coffee Traders", date: "Aug 24, 2026", items: 3, total: 41200, status: "pending", requestedBy: "Juan Cruz", aiMatch: false },
  { id: "PR-2026-0040", branch: "Gulod", supplier: "Metro Dairy Supply", date: "Aug 23, 2026", items: 8, total: 34600, status: "approved", requestedBy: "Ana Reyes", aiMatch: true },
  { id: "PR-2026-0039", branch: "Tagaytay", supplier: "Artisan Bakers PH", date: "Aug 22, 2026", items: 4, total: 18900, status: "completed", requestedBy: "Jose Lim", aiMatch: true },
  { id: "PR-2026-0038", branch: "Evo", supplier: "Sysco Philippines", date: "Aug 21, 2026", items: 5, total: 22100, status: "rejected", requestedBy: "Rosa Dela Cruz", aiMatch: false },
];

export const aiInsights = [
  { id: 1, title: "Whole Milk demand likely to rise", desc: "Avg daily usage increased 14% over the last two weeks. Lipa may reach reorder threshold within 3 days.", metric: "↑ 14% avg daily usage", action: "Consider ordering approx. 24 L for Lipa.", urgency: "high" },
  { id: 2, title: "Vermosa wastage rate above threshold", desc: "Wastage at Vermosa is 2.57% of inventory value, significantly above the 1.5% branch average.", metric: "2.57% vs 1.5% avg", action: "Review preparation procedures at Vermosa.", urgency: "medium" },
  { id: 3, title: "Arabica Beans: reorder in 4 days", desc: "Current stock at Lipa (12 kg) and avg daily consumption of 2.8 kg suggests depletion before next delivery.", metric: "12 kg on hand / 2.8 kg per day", action: "Review PR-2026-0042 pending approval.", urgency: "high" },
  { id: 4, title: "Weekend sales uplift forecast — Tagaytay", desc: "Historical data shows 18–22% weekend sales uplift at Tagaytay. Weather forecast may boost this further.", metric: "+18–22% weekend uplift", action: "Ensure adequate stock by Friday.", urgency: "low" },
];

export const cogsTrend = [
  { month: "Mar", theo: 95800, actual: 98200, margin: 57.4 },
  { month: "Apr", theo: 98400, actual: 101500, margin: 57.1 },
  { month: "May", theo: 102100, actual: 104800, margin: 56.9 },
  { month: "Jun", theo: 99700, actual: 102100, margin: 57.2 },
  { month: "Jul", theo: 106200, actual: 109400, margin: 56.8 },
  { month: "Aug", theo: 112300, actual: 115600, margin: 56.6 },
];

export const topProducts = [
  { product: "Espresso Blend", sales: 187400, pct: 100 },
  { product: "Whole Milk", sales: 162300, pct: 87 },
  { product: "Croissants", sales: 98700, pct: 53 },
  { product: "Almond Milk Latte", sales: 87200, pct: 47 },
  { product: "Sandwich Bread", sales: 74100, pct: 40 },
];
