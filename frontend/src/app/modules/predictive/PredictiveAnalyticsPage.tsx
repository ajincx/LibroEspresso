import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Package, RefreshCw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, CalendarDateField, StatusChip, KPICard, Card, SectionHeader, Select, TableCard, TableEmptyRow, TableWrapper, THead, TR, TD, ChartTip } from "../../components/ModuleUi";
import { predictiveService } from "../../services/predictive.service";
import type { PredictiveForecast } from "../../types/predictive";
import type { Role } from "../../types/navigation";
import { formatAppCurrency, formatAppDate } from "../../utils/appPreferences";
import { businessDate, addDateDays } from "../../utils/businessDate";
import { FORECAST_HORIZONS, forecastEndForHorizon, type ForecastHorizon } from "../../utils/forecastHorizon";

const DAY = 86_400_000;
const localToday = () => businessDate();
const addDays = (value: string, days: number) => new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const currency = formatAppCurrency;
const formatDate = formatAppDate;

const chartColors = [C.blue, C.maroon, C.amber];

export function PredictiveAnalytics({
  role,
  scopeBranchId,
  scopeBranchName = "All Branches",
}: {
  role: Role;
  scopeBranchId?: string;
  scopeBranchName?: string;
}) {
  const today = useMemo(localToday, []);
  const [forecastStart, setForecastStart] = useState(today);
  const [forecastEnd, setForecastEnd] = useState(addDays(today, 29));
  const [horizon, setHorizon] = useState<ForecastHorizon>("Next 30 Days");
  const [forecast, setForecast] = useState<PredictiveForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      setForecast(await predictiveService.generate({
        startDate: forecastStart,
        endDate: forecastEnd,
        branchId: role === "owner" ? scopeBranchId : undefined,
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to generate the forecast");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void generate(); }, [scopeBranchId, role]);

  const applyHorizon = (value: string) => {
    const selected = value as ForecastHorizon;
    setHorizon(selected);
    const endDate = forecastEndForHorizon(forecastStart, selected);
    if (endDate) setForecastEnd(endDate);
  };

  const inventoryChartData = (forecast?.inventorySeries ?? []).map((point) => ({
    label: point.label,
    ...Object.fromEntries(point.values.map((item) => [item.key, item.value])),
  }));
  const salesAccuracy = forecast?.accuracy.sales.overall;
  const accuracyChartData = useMemo(() => {
    const grouped = new Map<string, { date: string; actual: number; predicted: number }>();
    (salesAccuracy?.observations ?? []).forEach((row) => {
      const value = grouped.get(row.date) ?? { date: row.date, actual: 0, predicted: 0 };
      value.actual += row.actualValue;
      value.predicted += row.forecastValue;
      grouped.set(row.date, value);
    });
    return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)).map((row) => ({
      ...row,
      label: formatDate(row.date),
    }));
  }, [salesAccuracy]);
  const forecastDays = Math.max(1, Math.floor((Date.parse(forecastEnd) - Date.parse(forecastStart)) / DAY) + 1);

  return (
    <div className="predictive-page p-6 space-y-5">
      <SectionHeader
        title="Predictive Analytics"
        sub={`Pattern-based demand and inventory projections · ${scopeBranchName}`}
        actions={
          <div className="predictive-filters flex items-end gap-2 flex-wrap">
            <Select
              options={[...FORECAST_HORIZONS]}
              value={horizon}
              onChange={applyHorizon}
            />
            {horizon === "Custom Range" && (
              <>
                <CalendarDateField
                  label="Forecast start"
                  value={forecastStart}
                  min={today}
                  onChange={(value) => { setForecastStart(value); if (forecastEnd < value) setForecastEnd(value); }}
                />
                <CalendarDateField
                  label="Forecast end"
                  value={forecastEnd}
                  min={forecastStart}
                  max={addDateDays(forecastStart, 364)}
                  onChange={setForecastEnd}
                />
              </>
            )}
            <button
              type="button"
              onClick={() => void generate()}
              disabled={loading}
              className="h-10 px-4 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60"
              style={{ background: C.maroon }}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {loading ? "Analyzing…" : "Generate Forecast"}
            </button>
          </div>
        }
      />

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border" style={{ background: C.softMaroonBg, borderColor: C.border }}>
        <Sparkles size={15} className="mt-0.5 shrink-0" style={{ color: C.maroon }} />
        <div>
          <p className="text-xs font-semibold" style={{ color: C.maroon }}>
            Decision-support projection for {forecastDays.toLocaleString()} day{forecastDays === 1 ? "" : "s"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: C.secondary }}>
            Forecasts use recorded patterns to generate forward-looking predictions. They never create purchase orders or modify inventory automatically.
          </p>
        </div>
      </div>

      {error && (
        <Card>
          <div className="flex items-center gap-3" style={{ color: C.red }}>
            <AlertTriangle size={18} />
            <div><p className="text-sm font-semibold">Forecast could not be generated</p><p className="text-xs mt-1">{error}</p></div>
          </div>
        </Card>
      )}

      {loading && !forecast ? (
        <Card><div className="h-52 flex items-center justify-center gap-2 text-sm" style={{ color: C.secondary }}><RefreshCw size={17} className="animate-spin" />Analyzing database records…</div></Card>
      ) : forecast && (
        <>
          <div className="predictive-kpi-grid grid grid-cols-5 gap-4">
            <KPICard label="Forecasted Sales" value={currency(forecast.summary.forecastSales)} sub={`${formatDate(forecast.scope.forecastStart)} – ${formatDate(forecast.scope.forecastEnd)}`} icon={TrendingUp} color={C.blue} />
            <KPICard label="Demand Change" value={`${forecast.summary.demandChange >= 0 ? "+" : ""}${forecast.summary.demandChange.toFixed(1)}%`} sub="Against recent daily baseline" icon={Activity} color={C.green} />
            <KPICard label="Critical Items" value={`${forecast.summary.criticalItems} items`} sub="Estimated stock-out within 7 days" icon={AlertTriangle} color={C.red} />
            <KPICard label="Projected COGS" value={currency(forecast.summary.projectedCogs)} sub="Based on the historical recipe COGS rate" icon={TrendingDown} color={C.amber} />
            <KPICard label="Suggested Reorders" value={`${forecast.summary.recommendedReorders} items`} sub="Manager confirmation required" icon={Package} color={C.maroon} />
          </div>

          <Card padding={false}>
            <div className="px-5 pt-5">
              <h3 className="text-sm font-semibold" style={{ color: C.primary }}>Forecast Accuracy</h3>
              <p className="text-xs mt-1" style={{ color: C.secondary }}>Lower MAE indicates that forecasted values are closer to actual recorded values.</p>
            </div>
            <div className="grid lg:grid-cols-5 gap-4 p-5">
              <div className="lg:col-span-2 grid grid-cols-2 gap-3">
                <KPICard label="Sales MAE" value={salesAccuracy?.mae === null || salesAccuracy?.mae === undefined ? "Insufficient history" : currency(salesAccuracy.mae)} sub="Mean Absolute Error" icon={Activity} color={C.maroon} />
                <KPICard label="Days Evaluated" value={`${salesAccuracy?.evaluatedDays ?? 0}`} sub={salesAccuracy?.evaluationStart && salesAccuracy.evaluationEnd ? `${formatDate(salesAccuracy.evaluationStart)} – ${formatDate(salesAccuracy.evaluationEnd)}` : "No eligible evaluation period"} icon={RefreshCw} color={C.blue} />
                <KPICard label="Average Actual Sales" value={salesAccuracy?.averageActual === null || salesAccuracy?.averageActual === undefined ? "—" : currency(salesAccuracy.averageActual)} sub="Recorded evaluation observations" icon={TrendingUp} color={C.green} />
                <KPICard label="Average Forecast Sales" value={salesAccuracy?.averageForecast === null || salesAccuracy?.averageForecast === undefined ? "—" : currency(salesAccuracy.averageForecast)} sub="No future records used" icon={Activity} color={C.amber} />
              </div>
              <div className="lg:col-span-3 h-64">
                {accuracyChartData.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={accuracyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
                  <XAxis dataKey="label" tick={{fontSize:10,fill:C.secondary}} axisLine={false} tickLine={false} minTickGap={24}/>
                  <YAxis tick={{fontSize:10,fill:C.secondary}} axisLine={false} tickLine={false} tickFormatter={(value)=>`₱${(Number(value)/1000).toFixed(0)}k`}/>
                  <Tooltip content={<ChartTip/>}/><Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
                  <Area type="monotone" dataKey="actual" name="Actual Sales" stroke={C.maroon} fill={C.softMaroonBg} strokeWidth={2}/>
                  <Area type="monotone" dataKey="predicted" name="Forecast Sales" stroke={C.blue} fill={C.blueBg} strokeWidth={2} strokeDasharray="5 4"/>
                </AreaChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-xs text-center" style={{color:C.muted}}>At least 28 earlier recorded sales days are required before a date can be evaluated.</div>}
              </div>
            </div>
            {role === "owner" && forecast.accuracy.sales.branches.length > 1 && <div className="px-5 pb-5 overflow-x-auto"><table className="data-table w-full text-xs"><THead cols={["Branch","Evaluation Period","Days","Sales MAE"]}/><tbody>{forecast.accuracy.sales.branches.map((branch)=><TR key={branch.branchId}><TD bold>{branch.branchName}</TD><TD muted>{branch.evaluationStart && branch.evaluationEnd ? `${formatDate(branch.evaluationStart)} – ${formatDate(branch.evaluationEnd)}` : "Insufficient history"}</TD><TD right>{branch.evaluatedDays}</TD><TD right bold>{branch.mae === null ? "N/A" : currency(branch.mae)}</TD></TR>)}</tbody></table></div>}
          </Card>

          <TableCard title="Ingredient Usage Forecast Evaluation" subtitle="Each ingredient is evaluated only against compatible units and earlier recipe-derived usage records.">
            <TableWrapper minWidth={820}>
              <THead cols={["Ingredient",...(role === "owner" ? ["Branch"] : []),"Unit","Evaluation Period","Days","Average Actual","Average Forecast","MAE","Status"]}/>
              <tbody>{forecast.accuracy.ingredients.length ? forecast.accuracy.ingredients.map((item)=><TR key={`${item.branchId}-${item.inventoryItemId}`}><TD bold>{item.name}</TD>{role === "owner"&&<TD muted>{item.branchName}</TD>}<TD>{item.unit}</TD><TD muted>{item.evaluationStart&&item.evaluationEnd?`${formatDate(item.evaluationStart)} – ${formatDate(item.evaluationEnd)}`:"—"}</TD><TD right>{item.evaluatedDays}</TD><TD right>{item.averageActual===null?"—":`${item.averageActual.toLocaleString()} ${item.unit}`}</TD><TD right>{item.averageForecast===null?"—":`${item.averageForecast.toLocaleString()} ${item.unit}`}</TD><TD right bold>{item.mae===null?"N/A":`${item.mae.toLocaleString()} ${item.unit}`}</TD><TD center><StatusChip status={item.incompatibleUnits?"incompatible units":item.insufficientHistory?"insufficient history":"evaluated"}/></TD></TR>):<TableEmptyRow colSpan={role === "owner"?9:8} title="No ingredient evaluation available" subtitle="More recipe-derived ingredient usage history is required."/>}</tbody>
            </TableWrapper>
          </TableCard>

          <div className="predictive-chart-grid grid grid-cols-2 gap-5">
            <Card padding={false}>
              <div className="px-5 pt-5">
                <h3 className="text-sm font-semibold" style={{ color: C.primary }}>Demand Forecast</h3>
                <p className="text-xs mt-1 mb-4" style={{ color: C.secondary }}>Recorded sales compared with the selected future projection</p>
              </div>
              <div className="h-64 px-3 pb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecast.demandSeries}>
                    <defs>
                      <linearGradient id="actualSalesArea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.maroon} stopOpacity={0.35}/><stop offset="95%" stopColor={C.maroon} stopOpacity={0.02}/></linearGradient>
                      <linearGradient id="forecastSalesArea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue} stopOpacity={0.32}/><stop offset="95%" stopColor={C.blue} stopOpacity={0.02}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false} minTickGap={26} />
                    <YAxis tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false} tickFormatter={(value) => `₱${(Number(value) / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTip />} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="actualSales" name="Recorded Sales" stroke={C.maroon} strokeWidth={2} fill="url(#actualSalesArea)" connectNulls={false} />
                    <Area type="monotone" dataKey="projectedSales" name="Projected Sales" stroke={C.blue} strokeWidth={2} strokeDasharray="5 4" fill="url(#forecastSalesArea)" connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card padding={false}>
              <div className="px-5 pt-5">
                <h3 className="text-sm font-semibold" style={{ color: C.primary }}>Projected Inventory Levels</h3>
                <p className="text-xs mt-1 mb-4" style={{ color: C.secondary }}>Estimated depletion using recent recorded ingredient consumption</p>
              </div>
              <div className="h-64 px-3 pb-4">
                {forecast.inventoryChartItems.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={inventoryChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false} minTickGap={26} />
                      <YAxis tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                      {forecast.inventoryChartItems.map((item, index) => (
                        <Area key={item.key} type="monotone" dataKey={item.key} name={`${item.name} (${item.unit})`} stroke={chartColors[index % chartColors.length]} fill={chartColors[index % chartColors.length]} fillOpacity={0.08} strokeWidth={2} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-center px-8" style={{ color: C.muted }}>
                    No ingredient-usage history is available for an inventory projection.
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="predictive-detail-grid grid grid-cols-3 gap-5">
            <TableCard
              className="col-span-2"
              title="Inventory Risk & Reorder Suggestions"
              subtitle={forecast.methodology.stockProjectionAssumption}
              badge={
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">
                  {forecast.predictions.length} items
                </span>
              }
            >
              <TableWrapper minWidth={760}>
                <THead cols={["Ingredient", ...(role === "owner" ? ["Branch"] : []), "Current", "Confirmed Incoming", "Recent Daily Use", "Estimated Stock-out", "Projected End", "Suggested Reorder", "Urgency"]} />
                <tbody>
                  {forecast.predictions.length ? (
                    forecast.predictions.map((row) => (
                      <TR key={`${row.branchId}-${row.inventoryItemId}`}>
                        <TD>
                          <span className="font-semibold text-[var(--app-text)]">{row.name}</span>
                          <span className="block font-mono text-[10px] text-[var(--app-text-muted)]">{row.sku}</span>
                        </TD>
                        {role === "owner" && <TD muted>{row.branchName}</TD>}
                        <TD right muted>{row.systemStock.toLocaleString()} {row.unit}</TD>
                        <TD right muted>{row.outstandingQuantity.toLocaleString()} {row.unit}{row.nextDeliveryDate ? <span className="block text-[10px]">Expected {formatDate(row.nextDeliveryDate)}</span> : null}</TD>
                        <TD right muted>{row.dailyUsage.toLocaleString()} {row.unit}</TD>
                        <TD right>
                          <span style={{ color: row.urgency === "HIGH" ? C.red : C.secondary }}>
                            {row.daysToStockout === null ? "No usage pattern" : `~${Math.ceil(row.daysToStockout)} days`}
                          </span>
                        </TD>
                        <TD right muted>{row.projectedEndStock.toLocaleString()} {row.unit}</TD>
                        <TD right bold className="text-[var(--app-primary)]">
                          {row.recommendedReorder.toLocaleString()} {row.unit}
                        </TD>
                        <TD center>
                          <StatusChip status={row.urgency.toLowerCase()} kind="urgency" />
                        </TD>
                      </TR>
                    ))
                  ) : (
                    <TableEmptyRow
                      colSpan={role === "owner" ? 9 : 8}
                      title="No inventory risks calculated"
                      subtitle="No inventory risks can be calculated from the current records."
                    />
                  )}
                </tbody>
              </TableWrapper>
            </TableCard>

            <Card>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: C.softMaroonBg }}><Sparkles size={13} style={{ color: C.maroon }} /></div>
                  <div><h3 className="text-sm font-semibold" style={{ color: C.primary }}>AI-Assisted Insights</h3><p className="text-[10px] mt-0.5" style={{ color: C.muted }}>{forecast.methodology.insightSource === "GOOGLE_GEMINI" ? "Generated by Gemini from calculated findings" : "Generated from calculated system findings"}</p></div>
                </div>
                <StatusChip status={forecast.methodology.confidence.toLowerCase()} kind="confidence" />
              </div>
              <div className="space-y-3">
                {forecast.insights.map((insight, index) => (
                  <div key={`${insight.title}-${index}`} className="p-3 rounded-xl border" style={{ borderColor: insight.urgency === "HIGH" ? C.red : C.border, background: insight.urgency === "HIGH" ? C.redBg : C.mainBg }}>
                    <div className="flex items-start justify-between mb-1.5 gap-2">
                      <p className="text-xs font-bold leading-snug" style={{ color: C.primary }}>{insight.title}</p>
                      <StatusChip status={insight.urgency.toLowerCase()} kind="urgency" />
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: C.secondary }}>{insight.description}</p>
                    <p className="text-xs font-semibold mt-2" style={{ color: C.maroon }}>Recommendation: {insight.recommendation}</p>
                  </div>
                ))}
              </div>
              <div className="text-[10px] leading-relaxed mt-4 pt-3 border-t space-y-1" style={{ borderColor: C.border, color: C.muted }}>
                <p>Historical basis: {formatDate(forecast.methodology.historicalStart)} – {formatDate(forecast.methodology.historicalEnd)}</p>
                <p>{forecast.methodology.observedSalesDays} recorded sales day(s) · {forecast.methodology.confidence.toLowerCase()} confidence</p>
                <p>{forecast.methodology.disclaimer}</p>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
