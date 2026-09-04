import React, { lazy, Suspense, useEffect, useState } from "react";
import { ShoppingCart, Package, TrendingDown, FileText, Download, Check, Coffee, Info, TrendingUp, DollarSign, Activity, ClipboardList, GitCompare, BarChart2, Percent } from "lucide-react";
import { C, KPICard, Card, SectionHeader, Btn, Select, THead, TR, TD, EmptyState } from "../../components/ModuleUi";
import { branchPerf } from "../demoData";
import { toast } from "sonner";
import type { Page, Role } from "../../types/navigation";

export function Reports({ role }: { role: Role }) {
  const [generated, setGenerated] = useState(false);
  const reportTypes = [
    { name: "Sales Report", description: "Revenue and transactions", Icon: ShoppingCart, accent: C.maroon },
    { name: "COGS Report", description: "Direct cost performance", Icon: BarChart2, accent: C.amber },
    { name: "Inventory Status Report", description: "Stock levels and value", Icon: Package, accent: C.blue },
    { name: "Shrinkage Report", description: "Loss and spoilage trends", Icon: TrendingDown, accent: C.red },
    { name: "Variance Report", description: "Expected versus actual", Icon: GitCompare, accent: C.mediumMaroon },
    { name: "Purchase Order Report", description: "Requests and approvals", Icon: ClipboardList, accent: C.green },
    { name: "Predictive Forecast Report", description: "Demand and stock outlook", Icon: Activity, accent: C.maroon },
  ];
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState(false);

  const toggleReport = (report: string) => {
    setGenerated(false);
    setSelectionError(false);
    setSelectedReports(current => {
      if (report === "All Reports") return current.includes("All Reports") ? [] : ["All Reports"];
      const withoutAll = current.filter(item => item !== "All Reports");
      if (withoutAll.includes(report)) {
        return withoutAll.filter(item => item !== report);
      }
      return [...withoutAll, report];
    });
  };

  const generateReport = () => {
    if (selectedReports.length === 0) {
      setSelectionError(true);
      toast.error("Select at least one report type first.");
      return;
    }
    setSelectionError(false);
    setGenerated(true);
    toast.success("Report generated successfully");
  };

  const reportHeading = selectedReports.includes("All Reports")
    ? "All Reports"
    : selectedReports.length === 1 ? selectedReports[0] : selectedReports.length > 1 ? `${selectedReports.length} Reports Selected` : "Choose Reports";

  return (
    <div className="reports-page p-6 space-y-5">
      <SectionHeader title="Reports"
        sub="Generate, view and export operational reports"
        actions={generated ? <Btn variant="primary" icon={Download} size="sm">Export Excel</Btn> : undefined} />

      <div className="reports-layout grid grid-cols-5 gap-5">
        <Card className="reports-builder col-span-2 h-fit">
          <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Report Builder</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-end justify-between gap-3 mb-2.5">
                <div>
                  <label className="block text-sm font-semibold" style={{ color: C.primary }}>Report Types</label>
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>Choose one report or combine several.</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: C.softMaroonBg, color: C.maroon }}>
                  {selectedReports.includes("All Reports") ? "All selected" : selectedReports.length ? `${selectedReports.length} selected` : "Choose reports"}
                </span>
              </div>
              {selectedReports.length === 0 && (
                <div className="flex items-start gap-2 mt-2.5 px-3 py-2.5 rounded-xl border"
                  style={{ borderColor: selectionError ? C.red : C.border, background: selectionError ? C.redBg : C.surface }}
                  role={selectionError ? "alert" : "status"}>
                  <Info size={14} className="mt-0.5 flex-shrink-0" style={{ color: selectionError ? C.red : C.maroon }} />
                  <p className="text-xs leading-relaxed" style={{ color: selectionError ? C.red : C.secondary }}>
                    Select at least one report type before generating a report.
                  </p>
                </div>
              )}
              <div className="report-type-picker rounded-2xl border p-2.5" style={{ borderColor: C.border, background: C.mainBg }}>
                {(() => {
                  const selected = selectedReports.includes("All Reports");
                  return (
                    <button type="button" onClick={() => toggleReport("All Reports")}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors"
                      style={{ borderColor: selected ? C.maroon : C.border, background: selected ? C.softMaroonBg : C.surface }}
                      aria-pressed={selected}>
                      <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: selected ? C.maroon : C.softMaroonBg, color: selected ? "#fff" : C.maroon }}>
                        <FileText size={18} strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold" style={{ color: C.primary }}>All Reports</span>
                        <span className="block text-xs mt-0.5" style={{ color: C.secondary }}>Generate the complete operational report package.</span>
                      </span>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center border flex-shrink-0"
                        style={{ borderColor: selected ? C.maroon : C.border, background: selected ? C.maroon : C.surface }}>
                        {selected && <Check size={12} color="#fff" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })()}

                <div className="flex items-center gap-2 my-3">
                  <span className="h-px flex-1" style={{ background: C.border }} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: C.muted }}>Individual reports</span>
                  <span className="h-px flex-1" style={{ background: C.border }} />
                </div>

                <div className="report-type-grid grid grid-cols-2 gap-2">
                  {reportTypes.map(({ name, description, Icon, accent }) => {
                    const selected = selectedReports.includes(name);
                    return (
                      <button key={name} type="button" onClick={() => toggleReport(name)}
                        className="relative min-h-[84px] p-3 rounded-xl border text-left transition-colors"
                        style={{ borderColor: selected ? accent : C.border, background: selected ? `color-mix(in srgb, ${accent} 8%, ${C.surface})` : C.surface }}
                        aria-pressed={selected}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: `color-mix(in srgb, ${accent} 11%, transparent)`, color: accent }}>
                            <Icon size={15} strokeWidth={1.8} />
                          </span>
                          <span className="w-4 h-4 rounded-full flex items-center justify-center border"
                            style={{ borderColor: selected ? accent : C.border, background: selected ? accent : C.surface }}>
                            {selected && <Check size={10} color="#fff" strokeWidth={3} />}
                          </span>
                        </div>
                        <span className="block text-xs font-semibold mt-2" style={{ color: C.primary }}>{name}</span>
                        <span className="block text-[10px] mt-0.5 leading-snug" style={{ color: C.muted }}>{description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {role === "owner" && (
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Branch</label>
                <select className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }}>
                  {["All Branches", "Gulod – Main Branch", "Lipa", "Vermosa", "Tagaytay", "Evo"].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Date Range</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" defaultValue="2026-08-01" className="px-3 py-2 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }} />
                <input type="date" defaultValue="2026-08-26" className="px-3 py-2 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Category</label>
              <select className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }}>
                <option>All Categories</option>
                <option>Coffee</option>
                <option>Dairy</option>
                <option>Food</option>
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <Btn variant="outline" onClick={() => { setGenerated(false); setSelectedReports([]); setSelectionError(false); }}>Reset</Btn>
              <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.maroon }}
                onClick={generateReport}>
                Generate Report
              </button>
            </div>
          </div>
        </Card>

        <div className="reports-preview col-span-3 space-y-4">
          {!generated ? (
            <Card>
              <EmptyState icon={FileText} title="No report generated yet"
                body="Configure your report parameters on the left and click Generate Report to view results."
                action="Generate Report"
                onAction={generateReport} />
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold" style={{ color: C.primary }}>{reportHeading}</h3>
                  {!selectedReports.includes("All Reports") && selectedReports.length > 1 && (
                    <p className="text-xs mt-1" style={{ color: C.secondary }}>{selectedReports.join(" · ")}</p>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>Generated Aug 26, 2026 · 10:14 AM · All branches · Aug 1–26</p>
                </div>
              </div>
              <div className="reports-kpi-grid grid grid-cols-3 gap-3">
                <KPICard label="Total Sales" value="₱1,120,500" change="+8.3%" changeDir="up" icon={DollarSign} color={C.blue} />
                <KPICard label="Gross Profit" value="₱638,400" change="+10.7%" changeDir="up" icon={TrendingUp} color={C.green} />
                <KPICard label="Avg Margin" value="57.0%" change="-0.4pp" changeDir="down" icon={Percent} color={C.maroon} />
              </div>
              <Card padding={false}>
                <div className="overflow-x-auto">
              <table className="data-table w-full">
                    <THead cols={["Branch", "Sales", "COGS", "Gross Profit", "Margin", "Shrinkage"]} />
                    <tbody>
                      {branchPerf.map((b, i) => (
                        <TR key={i}>
                          <TD><span className="font-semibold">{b.branch}</span></TD>
                          <TD right>₱{b.sales.toLocaleString()}</TD>
                          <TD right muted>₱{b.cogs.toLocaleString()}</TD>
                          <TD right>₱{(b.sales - b.cogs).toLocaleString()}</TD>
                          <TD right><span style={{ color: C.green }}>{b.margin}%</span></TD>
                          <TD right><span style={{ color: C.red }}>₱{b.shrinkage.toLocaleString()}</span></TD>
                        </TR>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── User Management ───────────────────────────────────────────────────────────
