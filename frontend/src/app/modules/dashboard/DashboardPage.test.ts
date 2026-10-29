import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InventoryOverviewItem } from "../../types/operations";
import type { PredictiveForecast } from "../../types/predictive";
import { C, StatusChip } from "../../components/ModuleUi";
import {
  DASHBOARD_INVENTORY_TARGET,
  DASHBOARD_INVENTORY_ALERTS_ARE_PAGINATED,
  DASHBOARD_LATEST_POS_PAGE_SIZE,
  DASHBOARD_FOCUS_REFRESH_INTERVAL_MS,
  DASHBOARD_SHOWS_DAILY_POS_MONITORING,
  DashboardAnalyticsSkeleton,
  DashboardManagerActions,
  DashboardPosImportModal,
  DEFAULT_DASHBOARD_RANGE,
  STORAGE_KEY_DASHBOARD_USER_RANGE,
  DashboardToolbar,
  ForecastContentSkeleton,
  ForecastReplenishmentPanel,
  GrossMarginInfoDialog,
  InventoryAlertActions,
  OwnerDashboardHeader,
  ProductSalesRankingChart,
  adjustRangeForImport,
  clearDashboardUserRange,
  dashboardGreeting,
  forecastUrgencyAccent,
  getEffectiveDashboardBranchId,
  inventoryValueColor,
  prioritizeInventoryAlerts,
  productSalesSharePercent,
  rankDashboardProductSales,
  readDashboardUserRange,
  recordStockCountUrl,
  saveDashboardUserRange,
  shouldRefreshDashboardOnFocus,
  stockStatusChip,
} from "./DashboardPage";
import { adjustRangeForAutomaticImport } from "../../utils/businessDate";
import { PosImportModal } from "../cogs/PosImportModal";

const item=(name:string,status:InventoryOverviewItem["status"],stock:number,reorderLevel=10):InventoryOverviewItem=>({branchId:"branch",branchName:"Main",inventoryItemId:name,sku:name,name,category:"Coffee",unit:"g",unitCost:1,reorderLevel,reorderDays:7,lastActualQuantity:stock,lastCountAt:null,systemStock:stock,inventoryValue:stock,status,baselineAvailability:status==="NO_BASELINE"?"NO_BASELINE":"AVAILABLE"});

describe("dashboard presentation helpers",()=>{
  it("opens the shared POS import implementation from Dashboard",()=>{
    expect(DashboardPosImportModal).toBe(PosImportModal);
  });
  it("uses a backend-valid page size when loading the latest POS import",()=>{
    expect(DASHBOARD_LATEST_POS_PAGE_SIZE).toBeGreaterThanOrEqual(10);
  });
  it("does not refetch the full Dashboard for rapid repeated focus events",()=>{
    expect(shouldRefreshDashboardOnFocus(1_000,1_000+DASHBOARD_FOCUS_REFRESH_INTERVAL_MS-1)).toBe(false);
    expect(shouldRefreshDashboardOnFocus(1_000,1_000+DASHBOARD_FOCUS_REFRESH_INTERVAL_MS)).toBe(true);
  });
  it("does not render daily POS upload monitoring on the Dashboard",()=>{
    expect(DASHBOARD_SHOWS_DAILY_POS_MONITORING).toBe(false);
  });
  it("keeps the compact Dashboard inventory-alert summary unpaginated",()=>{
    expect(DASHBOARD_INVENTORY_ALERTS_ARE_PAGINATED).toBe(false);
  });
  it("uses the dynamic name and waving hand for each time-based greeting",()=>{
    expect(dashboardGreeting(8,"Gem")).toBe("Good morning, Gem 👋");
    expect(dashboardGreeting(13,"Maria")).toBe("Good afternoon, Maria 👋");
    expect(dashboardGreeting(20,"Ken")).toBe("Good evening, Ken 👋");
  });
  it("preserves stock severity order and supports a top-five summary",()=>{
    const alerts=prioritizeInventoryAlerts([item("Low","LOW_STOCK",8),item("Critical","CRITICAL",4),item("Out","OUT_OF_STOCK",0),item("Healthy","HEALTHY",20),item("Low 2","LOW_STOCK",7),item("Critical 2","CRITICAL",3),item("Low 3","LOW_STOCK",9)]);
    expect(alerts.map(row=>row.status).slice(0,3)).toEqual(["OUT_OF_STOCK","CRITICAL","CRITICAL"]);
    expect(alerts.slice(0,5)).toHaveLength(5);
    expect(alerts.some(row=>row.status==="HEALTHY")).toBe(false);
  });
  it("reuses Live Stock Catalog status semantics and links to Inventory Management",()=>{
    expect([stockStatusChip("OUT_OF_STOCK"),stockStatusChip("CRITICAL"),stockStatusChip("LOW_STOCK")]).toEqual(["out_neutral","critical","low"]);
    expect(stockStatusChip("NO_BASELINE")).toBe("no_baseline");
    expect(DASHBOARD_INVENTORY_TARGET).toBe("inventory");
  });
  it("renders Out of Stock with the neutral palette while Critical retains the danger palette",()=>{
    const outMarkup=renderToStaticMarkup(React.createElement(StatusChip,{status:stockStatusChip("OUT_OF_STOCK")}));
    const criticalMarkup=renderToStaticMarkup(React.createElement(StatusChip,{status:stockStatusChip("CRITICAL")}));
    expect(outMarkup).toContain(C.grayBg);
    expect(outMarkup).toContain(C.secondary);
    expect(criticalMarkup).toContain(C.redBg);
    expect(criticalMarkup).toContain(C.red);
  });
  it("uses normal foreground for non-negative stock values and red only for negative quantities",()=>{
    expect(inventoryValueColor(60000)).toBe("var(--app-text)");
    expect(inventoryValueColor(0)).toBe("var(--app-text)");
    expect(inventoryValueColor(-414)).not.toBe("var(--app-text)");
  });
  it("keeps actions and filters wrapping until a wide desktop layout is available",()=>{
    const markup=renderToStaticMarkup(React.createElement(DashboardToolbar,{actions:React.createElement("button",null,"Record Stock Count"),filters:React.createElement("span",null,"Today")}));
    expect(markup).toContain("data-dashboard-toolbar");
    expect(markup).toContain("xl:flex-row");
    expect(markup).not.toContain("lg:flex-row");
    expect(markup).toContain("min-w-0");
    expect(markup).toContain("flex-col");
    expect(markup).toContain("Record Stock Count");
    expect(markup).toContain("Today");
  });
  it("uses one compact responsive row for the Owner greeting, filters, range, and refresh",()=>{
    const markup=renderToStaticMarkup(React.createElement(OwnerDashboardHeader,{
      greeting:"Good evening, Owner 👋",
      subtitle:"Gulod / Main Branch · September 30, 2026 – October 29, 2026",
      filters:React.createElement("div",null,"Last 30 Days · vs Previous Period · September 30, 2026 – October 29, 2026"),
      onRefresh:()=>undefined,
    }));
    expect(markup).toContain("data-owner-dashboard-header");
    expect(markup).toContain("lg:flex-row");
    expect(markup).toContain("lg:items-center");
    expect(markup).toContain("Good evening, Owner 👋");
    expect(markup).toContain("Last 30 Days");
    expect(markup).toContain("vs Previous Period");
    expect(markup).toContain("Refresh");
    expect(markup.indexOf("Good evening, Owner 👋")).toBeLessThan(markup.indexOf("Last 30 Days"));
    expect(markup.indexOf("Last 30 Days")).toBeLessThan(markup.indexOf("Refresh"));
  });
  it("keeps the main purchase request action and removes the duplicate inventory-alert reorder action",()=>{
    const primaryActions=renderToStaticMarkup(React.createElement(DashboardManagerActions,{onRecordCount:()=>undefined,onImportSales:()=>undefined,onCreatePurchaseRequest:()=>undefined}));
    const alertActions=renderToStaticMarkup(React.createElement(InventoryAlertActions,{onViewAll:()=>undefined}));
    expect(primaryActions).toContain("Import Sales");
    expect(primaryActions).toContain("Create Purchase Request");
    expect(alertActions).toContain("View All Inventory");
    expect(alertActions).not.toContain("Create Reorder PO");
  });
  it("matches the Dashboard layout with six KPI, chart, and table loading placeholders",()=>{
    const markup=renderToStaticMarkup(React.createElement(DashboardAnalyticsSkeleton));
    expect(markup).toContain("data-dashboard-analytics-skeleton");
    expect(markup.match(/data-dashboard-kpi-skeleton/g)).toHaveLength(6);
    expect(markup).toContain("dashboard-kpis");
    expect(markup).toContain("Total Sales");
    expect(markup).toContain("Highest &amp; Lowest-Selling Menu Products");
    expect(markup).not.toContain("Sales &amp; Recipe COGS");
    expect(markup).toContain("Inventory Alerts");
    expect(markup).toContain("xl:col-span-2");
    expect(markup).toContain("Loading branch records");
    expect(markup).toContain("motion-reduce:animate-none");
  });
  it("ranks highest and lowest products by quantity with deterministic zero-sales handling",()=>{
    const products=[
      {id:"1",name:"Americano",unitsSold:12},{id:"2",name:"Latte",unitsSold:30},{id:"3",name:"Tea",unitsSold:0},
      {id:"4",name:"Mocha",unitsSold:18},{id:"5",name:"Cocoa",unitsSold:4},{id:"6",name:"Espresso",unitsSold:20},
    ];
    expect(rankDashboardProductSales(products).highest.map(({name})=>name)).toEqual(["Latte","Espresso","Mocha","Americano","Cocoa"]);
    expect(rankDashboardProductSales(products).lowest.map(({name})=>name)).toEqual(["Tea","Cocoa","Americano","Mocha","Espresso"]);
  });
  it("renders responsive ranked progress lists with accurate sales-share percentages",()=>{
    const products=[
      {id:"1",name:"Café Latte with a deliberately long product name",unitsSold:30},
      {id:"2",name:"Espresso",unitsSold:20},
      {id:"3",name:"Tea",unitsSold:10},
    ];
    const markup=renderToStaticMarkup(React.createElement(ProductSalesRankingChart,{products}));
    expect(productSalesSharePercent(30,60)).toBe(50);
    expect(markup).toContain("Top 5 Highest-Selling Menu Products");
    expect(markup).toContain("Top 5 Lowest-Selling Menu Products");
    expect(markup).toContain("50.0%");
    expect(markup).toContain("33.3%");
    expect(markup).toContain('role="meter"');
    expect(markup).toContain("break-words");
    expect(markup).toContain("motion-reduce:transition-none");
    expect(markup.match(/data-product-ranking-row/g)).toHaveLength(6);
  });
  it("shows honest empty and zero-sales product ranking states",()=>{
    const empty=renderToStaticMarkup(React.createElement(ProductSalesRankingChart,{products:[]}));
    const zero=renderToStaticMarkup(React.createElement(ProductSalesRankingChart,{products:[{id:"1",name:"Tea",unitsSold:0}]}));
    expect(empty).toContain("No active menu products are available");
    expect(zero).toContain("No accepted sales were recorded");
    expect(zero).toContain("Tea");
    expect(zero).toContain("0.0%");
  });
  it("routes Record Stock Count into Inventory Management with the current branch and date",()=>{
    expect(recordStockCountUrl("branch-2","2026-10-13")).toBe("/inventory?tab=counts&countIntent=record&countDate=2026-10-13&branchId=branch-2");
  });
  it("uses distinct existing status colors for forecast urgency",()=>{
    expect(new Set([forecastUrgencyAccent("LOW"),forecastUrgencyAccent("MEDIUM"),forecastUrgencyAccent("HIGH")]).size).toBe(3);
  });
  it("renders the information dialog as a responsive analytics summary without changing its values",()=>{
    const markup=renderToStaticMarkup(React.createElement(GrossMarginInfoDialog,{sales:20047,totalCogs:6255.18,grossProfit:13791.82,grossMargin:68.796,onClose:()=>undefined}));
    expect(markup).toContain("Gross Margin Calculation");
    expect(markup).toContain("Sales");
    expect(markup).toContain("Total COGS");
    expect(markup).toContain("Gross Profit");
    expect(markup).toContain("68.8%");
    expect(markup).toContain("Gross profit");
    expect(markup).toContain("max-w-lg");
    expect(markup).toContain("max-h-[calc(100dvh-2rem)]");
    expect(markup).toContain("sm:grid-cols-2");
    expect(markup).toContain("Detected shortages and verified shrinkage");
  });
});
const forecast={scope:{branchId:"branch",branchName:"Lipa",forecastStart:"2026-09-13",forecastEnd:"2026-10-12"},readiness:{status:"READY",minimumSalesDays:28,observedSalesDays:120,comparisonPeriodAvailable:true,recommendationsActionable:true,reason:null},methodology:{historicalStart:"2026-01-01",historicalEnd:"2026-09-12",observedSalesDays:120,confidence:"LOW",insightSource:"SYSTEM_ANALYSIS",disclaimer:"Forecasts are estimates based on recorded historical patterns.",salesMaeMethod:"MAE",cogsMaeMethod:"Sales-driven COGS MAE",ingredientMaeMethod:"MAE",shrinkageRateMethod:"Weighted weekly rates",stockProjectionAssumption:"Recorded usage"},summary:{forecastSales:125000,demandChange:4,criticalItems:1,projectedCogs:50000,projectedShrinkageRate:null,projectedShrinkageCost:null,shrinkageForecastStatus:"UNSUPPORTED_HORIZON",recommendedReorders:1},accuracy:{sales:{overall:{evaluationStart:null,evaluationEnd:null,evaluatedDays:0,observations:[],mae:null,averageActual:null,averageForecast:null,insufficientHistory:true},branches:[]},cogs:{overall:{evaluationStart:null,evaluationEnd:null,evaluatedDays:0,observations:[],mae:null,averageActual:null,averageForecast:null,insufficientHistory:true},branches:[]},ingredients:[],shrinkage:{maePercentagePoints:null,evaluatedWeeks:0,branches:[]}},demandSeries:[],inventorySeries:[],inventoryChartItems:[],predictions:[{branchId:"branch",branchName:"Lipa",inventoryItemId:"beans",sku:"BEAN-01",name:"Espresso Blend Beans",unit:"g",systemStock:2000,dailyUsage:150,outstandingQuantity:500,daysToStockout:12,nextDeliveryDate:null,projectedEndStock:-4000,recommendedReorder:4280,urgency:"HIGH"}],insights:[{title:"Projected demand pattern",description:"Sales may increase during the forecast period.",recommendation:"Review daily demand.",urgency:"LOW"},{title:"Potential stock-out risk",description:"One ingredient may run out.",recommendation:"Review replenishment needs.",urgency:"HIGH"},{title:"Limited historical coverage",description:"Some dates have limited records.",recommendation:"Continue recording complete sales data.",urgency:"MEDIUM"}]} as PredictiveForecast;

describe("Forecast & Replenishment presentation",()=>{
  it("keeps the forecast header visible while only its content uses skeletons",()=>{
    const markup=renderToStaticMarkup(React.createElement(ForecastReplenishmentPanel,{forecast:null,forecastError:"",role:"manager",onReview:()=>undefined,onCreateOrder:()=>undefined}));
    expect(markup).toContain("Decision-support forecast");
    expect(markup).toContain("Review Forecast");
    expect(markup).toContain("data-forecast-content-skeleton");
    expect(markup).not.toContain("animate-spin");
    expect(markup).not.toContain("Loading forecast…");
  });
  it("renders a subtle accessible forecast content skeleton",()=>{
    const markup=renderToStaticMarkup(React.createElement(ForecastContentSkeleton));
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Loading Decision-Support Forecast");
    expect(markup).toContain("Projected sales");
    expect(markup).toContain("Forecast confidence");
    expect(markup).toContain("Forecast insights");
    expect(markup).toContain("motion-reduce:animate-none");
  });
  it("keeps forecast data, confidence, insight actions, reorder action, and disclaimer visible",()=>{
    const markup=renderToStaticMarkup(React.createElement(ForecastReplenishmentPanel,{forecast,forecastError:"",role:"manager",onReview:()=>undefined,onCreateOrder:()=>undefined}));
    expect(markup).toContain("Next 30 Days · Forecast &amp; Replenishment");
    expect(markup).toContain("Low confidence");
    expect(markup).toContain("Projected demand pattern");
    expect(markup).toContain("Potential stock-out risk");
    expect(markup).toContain("Limited historical coverage");
    expect(markup).toContain("Review Forecast");
    expect(markup.match(/>Review</g)).toHaveLength(3);
    expect(markup).toContain("Create PO from Recommendation");
    expect(markup).toContain(forecast.methodology.disclaimer);
    expect(markup).not.toContain("inset-y-0 left-0 w-1");
    expect(markup).not.toContain("border-l-");
  });
});

describe("dashboard scope and range synchronization", () => {
  it("defaults the dashboard range to the current seven Manila business dates", () => {
    expect(DEFAULT_DASHBOARD_RANGE).toBe("7d");
  });

  it("resolves the branch ID correctly for owner and manager roles", () => {
    expect(getEffectiveDashboardBranchId("owner", "ALL", "branch-mgr")).toBeUndefined();
    expect(getEffectiveDashboardBranchId("owner", "branch-1", "branch-mgr")).toBe("branch-1");
    expect(getEffectiveDashboardBranchId("owner", undefined, "branch-mgr")).toBeUndefined();
    expect(getEffectiveDashboardBranchId("manager", "ALL", "branch-mgr")).toBe("branch-mgr");
    expect(getEffectiveDashboardBranchId("manager", undefined, undefined)).toBeUndefined();
  });

  it("adjusts range to mtd when an import occurs outside today's scope", () => {
    const adjusted = adjustRangeForImport("today", "2026-09-26", "2026-09-26", "2026-09-16", "2026-09-26");
    expect(adjusted).toEqual({ range: "mtd" });
  });

  it("returns null when an imported date is already within the active range", () => {
    const adjusted = adjustRangeForImport("mtd", "2026-09-01", "2026-09-26", "2026-09-16", "2026-09-26");
    expect(adjusted).toBeNull();
  });

  it("expands custom range when imported date precedes the current range", () => {
    const adjusted = adjustRangeForImport("mtd", "2026-09-01", "2026-09-26", "2026-08-25", "2026-09-26");
    expect(adjusted).toEqual({
      range: "custom",
      customStart: "2026-08-25",
      customEnd: "2026-09-26",
    });
  });

  it("expands to custom range when range is today and imported date is from a previous month", () => {
    const adjusted = adjustRangeForImport("today", "2026-10-01", "2026-10-01", "2026-09-16", "2026-10-01");
    expect(adjusted).toEqual({
      range: "custom",
      customStart: "2026-09-16",
      customEnd: "2026-10-01",
    });
  });

  it("expands customEnd when imported date succeeds the current range", () => {
    const adjusted = adjustRangeForImport("custom", "2026-09-01", "2026-09-15", "2026-09-20", "2026-10-01");
    expect(adjusted).toEqual({
      range: "custom",
      customStart: "2026-09-01",
      customEnd: "2026-09-20",
    });
  });

  it("preserves an explicitly selected reporting range after an import", () => {
    expect(adjustRangeForAutomaticImport(true, "custom", "2026-09-01", "2026-09-15", "2026-09-16", "2026-10-01")).toBeNull();
  });
});

describe("dashboard user-selected range persistence", () => {
  let mockStorage: Record<string, string> = {};
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => { mockStorage[key] = String(val); },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; },
      get length() { return Object.keys(mockStorage).length; },
      key: (i: number) => Object.keys(mockStorage)[i] ?? null,
    };
    try {
      Object.defineProperty(globalThis, "localStorage", {
        value: storageMock,
        writable: true,
        configurable: true,
      });
    } catch {
      // fallback
    }
  });

  afterEach(() => {
    try {
      Object.defineProperty(globalThis, "localStorage", {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
    } catch {
      // fallback
    }
  });

  it("returns null when no range is stored", () => {
    expect(readDashboardUserRange()).toBeNull();
  });

  it("returns null when stored data is malformed", () => {
    globalThis.localStorage.setItem(STORAGE_KEY_DASHBOARD_USER_RANGE, "not-json");
    expect(readDashboardUserRange()).toBeNull();
    globalThis.localStorage.setItem(STORAGE_KEY_DASHBOARD_USER_RANGE, JSON.stringify({ notRange: 123 }));
    expect(readDashboardUserRange()).toBeNull();
  });

  it("saves and retrieves user-selected custom range configuration", () => {
    saveDashboardUserRange({
      range: "custom",
      customStart: "2026-09-16",
      customEnd: "2026-10-01",
    });
    const retrieved = readDashboardUserRange();
    expect(retrieved).toEqual({
      range: "custom",
      customStart: "2026-09-16",
      customEnd: "2026-10-01",
    });
  });

  it("clears user range from storage", () => {
    saveDashboardUserRange({ range: "mtd" });
    expect(readDashboardUserRange()).toEqual({ range: "mtd" });
    clearDashboardUserRange();
    expect(readDashboardUserRange()).toBeNull();
  });
});
