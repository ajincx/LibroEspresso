import { describe, expect, it } from "vitest";
import type { InventoryOverviewItem } from "../../types/operations";
import { DASHBOARD_INVENTORY_TARGET, dashboardGreeting, prioritizeInventoryAlerts, stockStatusChip } from "./DashboardPage";

const item=(name:string,status:InventoryOverviewItem["status"],stock:number,reorderLevel=10):InventoryOverviewItem=>({branchId:"branch",branchName:"Main",inventoryItemId:name,sku:name,name,category:"Coffee",unit:"g",unitCost:1,reorderLevel,reorderDays:7,lastActualQuantity:stock,lastCountAt:null,systemStock:stock,inventoryValue:stock,status});

describe("dashboard presentation helpers",()=>{
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
    expect([stockStatusChip("OUT_OF_STOCK"),stockStatusChip("CRITICAL"),stockStatusChip("LOW_STOCK")]).toEqual(["out","critical","low"]);
    expect(DASHBOARD_INVENTORY_TARGET).toBe("inventory");
  });
});
