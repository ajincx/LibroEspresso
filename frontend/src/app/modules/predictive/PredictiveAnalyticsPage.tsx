import React, { lazy, Suspense, useEffect, useState } from "react";
import { Package, AlertTriangle, TrendingDown, Sparkles, TrendingUp, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from "recharts";
import { C, StatusChip, KPICard, Card, SectionHeader, Select, THead, TR, TD, ChartTip } from "../../components/ModuleUi";
import { aiInsights } from "../demoData";
import type { Page, Role } from "../../types/navigation";

export function PredictiveAnalytics({ role }: { role: Role }) {
  const [horizon, setHorizon] = useState("7");

  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="Predictive Analytics"
        sub="AI-assisted demand forecasting and inventory intelligence"
        actions={
          <>
            {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} />}
            <div className="flex items-center gap-0.5 border rounded-lg p-0.5" style={{ borderColor: C.border }}>
              {["7", "14", "30"].map(d => (
                <button key={d} onClick={() => setHorizon(d)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                  style={{ background: horizon === d ? C.maroon : "transparent", color: horizon === d ? "#fff" : C.secondary }}>
                  {d}d
                </button>
              ))}
            </div>
          </>
        } />

      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl" style={{ background: C.softMaroonBg }}>
        <Sparkles size={14} style={{ color: C.maroon }} />
        <p className="text-xs font-medium" style={{ color: C.maroon }}>
          Powered by Google Gemini · Forecasts are decision-support tools only. All purchasing decisions require human review and authorization.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <KPICard label="Forecasted Inv. Cost" value="₱328,400" change="+4.8% projected" changeDir="down" icon={TrendingUp} color={C.blue} />
        <KPICard label="Demand Change" value="+7.2%" sub="Next 7 days" icon={Activity} color={C.green} />
        <KPICard label="Critical Items" value="3 items" sub="Stockout < 7 days" icon={AlertTriangle} color={C.red} />
        <KPICard label="Projected Shrinkage" value="1.72%" sub="+0.07pp above target" icon={TrendingDown} color={C.amber} />
        <KPICard label="Recommended Reorders" value="8 items" sub="Across all branches" icon={Package} color={C.maroon} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card padding={false}>
          <div className="px-5 pt-5 pb-0">
            <h3 className="font-semibold mb-1" style={{ color: C.primary }}>Demand Forecast</h3>
            <p className="text-xs mb-4" style={{ color: C.secondary }}>Historical vs. {horizon}-day AI forecast</p>
          </div>
          <div className="h-52 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={[
                { date: "Aug 19", actual: 38200, forecast: null },
                { date: "Aug 20", actual: 41500, forecast: null },
                { date: "Aug 21", actual: 44200, forecast: null },
                { date: "Aug 22", actual: 39800, forecast: null },
                { date: "Aug 23", actual: 46100, forecast: null },
                { date: "Aug 24", actual: 52400, forecast: null },
                { date: "Aug 25", actual: 48700, forecast: 48700 },
                { date: "Aug 26", actual: null, forecast: 50200 },
                { date: "Aug 27", actual: null, forecast: 53100 },
                { date: "Aug 28", actual: null, forecast: 51800 },
                { date: "Aug 29", actual: null, forecast: 54600 },
                { date: "Aug 30", actual: null, forecast: 56200 },
                { date: "Aug 31", actual: null, forecast: 58900 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="actual" name="Actual Sales" stroke={C.maroon} strokeWidth={2} dot={{ fill: C.maroon, r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="forecast" name="AI Forecast" stroke={C.blue} strokeWidth={2} strokeDasharray="5 4" dot={{ fill: C.blue, r: 3 }} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card padding={false}>
          <div className="px-5 pt-5 pb-0">
            <h3 className="font-semibold mb-1" style={{ color: C.primary }}>Projected Inventory Levels</h3>
            <p className="text-xs mb-4" style={{ color: C.secondary }}>Critical items — predicted depletion trajectory</p>
          </div>
          <div className="h-52 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[
                { date: "Aug 26", milk: 45, beans: 12, sugar: 8 },
                { date: "Aug 27", milk: 36, beans: 9.2, sugar: 6.7 },
                { date: "Aug 28", milk: 27, beans: 6.4, sugar: 5.4 },
                { date: "Aug 29", milk: 18, beans: 3.6, sugar: 4.1 },
                { date: "Aug 30", milk: 9, beans: 0.8, sugar: 2.8 },
                { date: "Aug 31", milk: 0, beans: 0, sugar: 1.5 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="milk" name="Whole Milk (L)" stroke={C.blue} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="beans" name="Arabica Beans (kg)" stroke={C.maroon} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="sugar" name="White Sugar (kg)" stroke={C.amber} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Card className="col-span-2" padding={false}>
          <div className="px-5 pt-5 pb-3">
            <h3 className="font-semibold mb-3" style={{ color: C.primary }}>Low Stock Prediction</h3>
          </div>
          <div className="overflow-x-auto">
              <table className="data-table w-full">
              <THead cols={["Ingredient", ...(role === "owner" ? ["Branch"] : []), "Current Qty", "Daily Usage", "Predicted Stockout", "Recommended Reorder", "Urgency"]} />
              <tbody>
                {[
                  { item: "Whole Milk", branch: "Lipa", qty: "45 L", usage: "9 L/day", stockout: "5 days", reorder: "24 L", urgency: "high" },
                  { item: "Arabica Beans", branch: "Lipa", qty: "12 kg", usage: "2.8 kg/day", stockout: "4 days", reorder: "10 kg", urgency: "high" },
                  { item: "White Sugar", branch: "Lipa", qty: "8 kg", usage: "1.3 kg/day", stockout: "6 days", reorder: "20 kg", urgency: "high" },
                  { item: "Croissants", branch: "Vermosa", qty: "18 pcs", usage: "28 pcs/day", stockout: "1 day", reorder: "60 pcs", urgency: "high" },
                  { item: "Oat Milk", branch: "Gulod", qty: "52 L", usage: "8 L/day", stockout: "6 days", reorder: "30 L", urgency: "medium" },
                ].map((r, i) => (
                  <TR key={i}>
                    <TD><span className="font-medium">{r.item}</span></TD>
                    {role === "owner" && <TD muted>{r.branch}</TD>}
                    <TD right muted>{r.qty}</TD>
                    <TD right muted>{r.usage}</TD>
                    <TD right><span style={{ color: parseInt(r.stockout) <= 4 ? C.red : C.amber }}>{r.stockout}</span></TD>
                    <TD right muted>{r.reorder}</TD>
                    <TD><StatusChip status={r.urgency} /></TD>
                  </TR>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: C.softMaroonBg }}>
              <Sparkles size={13} style={{ color: C.maroon }} />
            </div>
            <h3 className="text-sm font-semibold" style={{ color: C.primary }}>AI Insights</h3>
          </div>
          <div className="space-y-3">
            {aiInsights.slice(0, 3).map(ins => (
              <div key={ins.id} className="p-3 rounded-xl border"
                style={{ borderColor: ins.urgency === "high" ? C.red : C.border, background: ins.urgency === "high" ? C.redBg : C.mainBg }}>
                <div className="flex items-start justify-between mb-1.5 gap-2">
                  <p className="text-xs font-bold leading-snug" style={{ color: C.primary }}>{ins.title}</p>
                  <StatusChip status={ins.urgency === "high" ? "high" : ins.urgency === "medium" ? "medium" : "low_urgency"} />
                </div>
                <p className="text-xs leading-relaxed mb-1.5" style={{ color: C.secondary }}>{ins.desc}</p>
                <p className="text-xs font-semibold" style={{ color: C.maroon }}>↗ {ins.action.split(".")[0]}</p>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3 pt-3 border-t" style={{ borderColor: C.border, color: C.muted }}>
            Management approval required before acting on AI recommendations.
          </p>
        </Card>
      </div>
    </div>
  );
}

// ─── Reports ───────────────────────────────────────────────────────────────────
