import { describe,expect,it } from "vitest";
import { resolveDailyPosStatus } from "./posDailyMonitoring.service.js";

const base={businessDate:"2026-09-27",today:"2026-09-27",hasConfiguredSource:true,hasImport:false,closed:false};
describe("daily POS monitoring",()=>{
  it("does not call an unconfigured branch missing",()=>expect(resolveDailyPosStatus({...base,hasConfiguredSource:false})).toBe("POS_SOURCE_NOT_CONFIGURED"));
  it("distinguishes a declared closed day",()=>expect(resolveDailyPosStatus({...base,closed:true})).toBe("NO_SALES_CLOSED"));
  it("reports an on-time committed import as uploaded",()=>expect(resolveDailyPosStatus({...base,hasImport:true,importedAt:"2026-09-27T13:30:00.000Z"})).toBe("UPLOADED"));
  it("keeps today due until midnight instead of treating the reminder time as the deadline",()=>expect(resolveDailyPosStatus(base)).toBe("DUE_TODAY"));
  it("marks an earlier business date without an import as missing",()=>expect(resolveDailyPosStatus({...base,businessDate:"2026-09-26"})).toBe("MISSING_UPLOAD"));
  it("identifies an import committed after its Manila business-day deadline",()=>expect(resolveDailyPosStatus({...base,businessDate:"2026-09-26",hasImport:true,importedAt:"2026-09-26T16:01:00.000Z"})).toBe("LATE_UPLOAD"));
  it("does not call a future date missing",()=>expect(resolveDailyPosStatus({...base,businessDate:"2026-09-28"})).toBe("UPCOMING"));
});
