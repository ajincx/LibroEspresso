import { describe, expect, it } from "vitest";
import {
  buildAttention, causeShares, comparablePeriods, comparisons, contributionShares,
  financialValues, groupingForPeriod, inventoryRisk, metricComparison, normalizedMae, productProfitability,
} from "./reportCalculations.service.js";

describe("approved report calculations", () => {
  it("creates an immediately preceding equal-length period", () => {
    expect(comparablePeriods("2026-09-01","2026-09-30")).toEqual({startDate:"2026-09-01",endDate:"2026-09-30",previousStartDate:"2026-08-02",previousEndDate:"2026-08-31",lengthDays:30});
  });
  it("handles leap-day comparable periods",()=>expect(comparablePeriods("2024-02-29","2024-02-29").previousEndDate).toBe("2024-02-28"));
  it("returns N/A for a zero previous denominator",()=>expect(metricComparison(10,0).percentageChange).toBeNull());
  it("calculates absolute and percentage change",()=>expect(metricComparison(120,100)).toEqual({current:120,previous:100,absoluteChange:20,percentageChange:20}));
  it("uses canonical financial semantics and keeps shrinkage separate",()=>expect(financialValues({sales:1000,productCogs:400,detectedShortageValue:90,verifiedShrinkageCost:40})).toEqual({sales:1000,totalCogs:400,grossProfit:600,grossMargin:60,detectedShortageValue:90,verifiedShrinkageCost:40}));
  it("builds comparisons for all official metrics",()=>expect(Object.keys(comparisons(financialValues({sales:1,productCogs:1,detectedShortageValue:0,verifiedShrinkageCost:0}),financialValues({sales:0,productCogs:0,detectedShortageValue:0,verifiedShrinkageCost:0})))).toHaveLength(6));
  it("selects daily grouping for short ranges",()=>expect(groupingForPeriod(30)).toBe("day"));
  it("selects weekly grouping for medium ranges",()=>expect(groupingForPeriod(90)).toBe("week"));
  it("selects monthly grouping for long ranges",()=>expect(groupingForPeriod(365)).toBe("month"));
  it("calculates product gross profit, margin, and COGS share",()=>expect(productProfitability([{id:"a",revenue:200,cogs:50},{id:"b",revenue:100,cogs:50}])).toEqual([{id:"a",revenue:200,cogs:50,grossProfit:150,grossMargin:75,shareOfTotalCogs:50},{id:"b",revenue:100,cogs:50,grossProfit:50,grossMargin:50,shareOfTotalCogs:50}]));
  it("does not produce NaN for zero product revenue or COGS",()=>expect(productProfitability([{revenue:0,cogs:0}])[0]).toMatchObject({grossMargin:0,shareOfTotalCogs:0}));
  it("calculates ingredient contribution within each product",()=>expect(contributionShares([{productId:"a",cost:25},{productId:"a",cost:75},{productId:"b",cost:10}]).map(row=>row.sharePercent)).toEqual([25,75,100]));
  it("calculates verified cause shares",()=>expect(causeShares([{cost:20},{cost:30}]).map(row=>row.sharePercent)).toEqual([40,60]));
  it("returns zero verified cause share with no cost",()=>expect(causeShares([{cost:0}]).at(0)!.sharePercent).toBe(0));
  it("marks stock-out before replenishment critical",()=>expect(inventoryRisk({branchId:"b",branchName:"Lipa",inventoryItemId:"i",name:"Milk",unit:"ml",currentStock:20,reorderLevel:10,reorderDays:7,dailyUsage:10,incomingDeliveries:[{expectedDeliveryDate:"2026-09-10",quantity:100}],projectionStart:"2026-09-01"})).toMatchObject({risk:"CRITICAL",daysToStockout:2}));
  it("does not let a late incoming PO hide stock-out",()=>expect(inventoryRisk({branchId:"b",branchName:"Lipa",inventoryItemId:"i",name:"Milk",unit:"ml",currentStock:20,reorderLevel:10,reorderDays:7,dailyUsage:10,incomingDeliveries:[{expectedDeliveryDate:"2026-09-05",quantity:100}],projectionStart:"2026-09-01"}).reason).toContain("no confirmed delivery before depletion"));
  it("marks stock below reorder level medium when depletion is outside horizon",()=>expect(inventoryRisk({branchId:"b",branchName:"Lipa",inventoryItemId:"i",name:"Beans",unit:"g",currentStock:20,reorderLevel:25,reorderDays:7,dailyUsage:1,incomingDeliveries:[],projectionStart:"2026-09-01"}).risk).toBe("MEDIUM"));
  it("keeps adequately supplied inventory normal",()=>expect(inventoryRisk({branchId:"b",branchName:"Lipa",inventoryItemId:"i",name:"Beans",unit:"g",currentStock:100,reorderLevel:25,reorderDays:7,dailyUsage:1,incomingDeliveries:[],projectionStart:"2026-09-01"}).risk).toBe("NORMAL"));
  it("calculates normalized MAE without calling it accuracy",()=>expect(normalizedMae({evaluationStart:null,evaluationEnd:null,evaluatedDays:30,observations:[],mae:20,averageActual:100,averageForecast:90,insufficientHistory:false})).toBe(20));
  it("returns N/A normalized MAE when average actual is zero",()=>expect(normalizedMae({evaluationStart:null,evaluationEnd:null,evaluatedDays:0,observations:[],mae:0,averageActual:0,averageForecast:0,insufficientHistory:true})).toBeNull());
  it("surfaces high unresolved records using the exposed period-average rule",()=>expect(buildAttention({unresolved:[{id:"1",branchId:"b",branchName:"Lipa",ingredient:"Milk",value:100},{id:"2",branchId:"b",branchName:"Lipa",ingredient:"Sugar",value:20}],risks:[],repeatedCauses:[],lowMarginProducts:[],overdueOrders:[]}).map(row=>row.title)).toEqual(["Milk — Lipa"]));
  it("does not warn for resolved normal records",()=>expect(buildAttention({unresolved:[],risks:[inventoryRisk({branchId:"b",branchName:"Lipa",inventoryItemId:"i",name:"Beans",unit:"g",currentStock:100,reorderLevel:25,reorderDays:7,dailyUsage:1,incomingDeliveries:[],projectionStart:"2026-09-01"})],repeatedCauses:[{branchId:"b",branchName:"Lipa",inventoryItemId:"i",ingredient:"Beans",cases:1}],lowMarginProducts:[],overdueOrders:[]})).toEqual([]));
  it("exposes deterministic reasons for repeated shrinkage and overdue orders",()=>{const rows=buildAttention({unresolved:[],risks:[],repeatedCauses:[{branchId:"b",branchName:"Lipa",inventoryItemId:"i",ingredient:"Milk",cases:2}],lowMarginProducts:[],overdueOrders:[{id:"p",branchId:"b",branchName:"Lipa",poNo:"PO-1",expectedDeliveryDate:"2026-09-01"}]});expect(rows.every(row=>row.reason.length>10)).toBe(true);});
});
