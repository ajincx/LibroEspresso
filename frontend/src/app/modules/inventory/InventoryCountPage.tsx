import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle, ClipboardList, RefreshCw, Send } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import type { CountVarianceItem, DailyInventoryCountContext, ExpectedInventoryItem, FullInventoryCountContext, InventoryCountType, PhysicalInventoryCountReference, UnavailableInventoryCountItem } from "../../types/inventoryWorkflow";
import { CalendarDateField, TableCard, TableWrapper, THead, TR, TD, TableEmptyRow, TableLoadingRow, Btn, SearchInput, Select, SkeletonBlock } from "../../components/ModuleUi";
import { ControlledActionDialog } from "../../components/ControlledActionDialog";

import { businessDate } from "../../utils/businessDate";
import { formatAppDate } from "../../utils/appPreferences";

export const isFutureInventoryCountDate = (countDate: string, currentBusinessDate = businessDate()) =>
  countDate > currentBusinessDate;

export const PHYSICAL_COUNT_INVESTIGATION_GUIDANCE =
  "Significant discrepancies may require an investigation based on the configured tolerance.";

export const initialPhysicalCountDate = (requestedDate: string | null, currentBusinessDate = businessDate()) =>
  requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && !isFutureInventoryCountDate(requestedDate, currentBusinessDate)
    ? requestedDate
    : currentBusinessDate;

export const showInventoryCountDateFilter = (countType: InventoryCountType) => countType === "FULL";
export const savedCountQuantities = (items: Array<{ inventoryItemId: string; actualQuantity: number }>) =>
  Object.fromEntries(items.map((item) => [item.inventoryItemId, item.actualQuantity]));

export function PhysicalCountLoadingSkeleton({countType="FULL"}:{countType?:InventoryCountType}) {
  const columns=inventoryCountColumns(countType);
  return <div data-physical-count-skeleton role="status" aria-label="Calculating expected stock" className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      {["Count date","Count type","Ingredients"].map((label) => <div key={label} className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4"><p className="text-xs font-semibold text-[var(--app-text-muted)]">{label}</p><SkeletonBlock w="70%" h={18} className="mt-3"/></div>)}
    </div>
    <div className="overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)]">
      <div className="flex flex-col gap-3 border-b border-[var(--app-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-bold">{countType==="FULL"?"Full Physical Count Entry":countType==="OPENING"?"Opening Count":"Closing Count"}</h2><p className="mt-1 text-xs text-[var(--app-text-muted)]">Record and verify physical stock. Expected stock remains system-calculated.</p></div>
        <SkeletonBlock w={180} h={40} className="rounded-xl"/>
      </div>
      <TableWrapper minWidth={countType==="FULL"?900:1120}><THead cols={columns}/><tbody>{Array.from({length:7},(_,index)=><TableLoadingRow key={index} colSpan={columns.length}/>)}</tbody></TableWrapper>
    </div>
    <span className="sr-only">Calculating expected stock from recipes and POS sales…</span>
  </div>;
}

export type PhysicalCountCompletionFilter = "ALL" | "COUNTED" | "NOT_COUNTED";

export const filterPhysicalCountItems = (
  items: ExpectedInventoryItem[],
  search: string,
  completionFilter: PhysicalCountCompletionFilter = "ALL",
  entries: Record<string, PhysicalCountEntry> = {},
) => {
  const query = search.trim().toLocaleLowerCase();
  const searched = query
    ? items.filter((item) => item.itemName.toLocaleLowerCase().includes(query) || item.sku.toLocaleLowerCase().includes(query))
    : items;
  if (completionFilter === "ALL") return searched;
  return searched.filter((item) => {
    const counted = confirmedPhysicalCountPreview(entries[item.inventoryItemId] ?? blankPhysicalCountEntry(item.unit), item.unit) !== null;
    return completionFilter === "COUNTED" ? counted : !counted;
  });
};

export type PhysicalCountUnit = "g" | "kg" | "ml" | "L" | "pc";
export type PhysicalCountEntry = { quantity: string; enteredUnit: PhysicalCountUnit; confirmed?: boolean };

export const allowedPhysicalCountUnits = (canonicalUnit: string): PhysicalCountUnit[] => {
  if (canonicalUnit === "g") return ["g", "kg"];
  if (canonicalUnit === "ml") return ["ml", "L"];
  return ["pc"];
};

export const blankPhysicalCountEntry = (canonicalUnit: string): PhysicalCountEntry => ({
  quantity: "",
  enteredUnit: allowedPhysicalCountUnits(canonicalUnit)[0]!,
  confirmed: false,
});

export const expectedStockSuggestionEntry = (item: ExpectedInventoryItem): PhysicalCountEntry =>
  Number.isFinite(item.expectedQuantity) && item.expectedQuantity >= 0
    ? { quantity: String(item.expectedQuantity), enteredUnit: allowedPhysicalCountUnits(item.unit)[0]!, confirmed: false }
    : blankPhysicalCountEntry(item.unit);

export const initialPhysicalCountEntries = (items: ExpectedInventoryItem[], countType: InventoryCountType) =>
  Object.fromEntries(items.map((item) => [
    item.inventoryItemId,
    countType === "FULL" ? blankPhysicalCountEntry(item.unit) : expectedStockSuggestionEntry(item),
  ]));

export const normalizePhysicalCountPreview = (
  entry: PhysicalCountEntry,
  canonicalUnit: string,
) => {
  const quantity = Number(entry.quantity);
  if (entry.quantity.trim() === "" || !Number.isFinite(quantity) || quantity < 0) return null;
  if (!allowedPhysicalCountUnits(canonicalUnit).includes(entry.enteredUnit)) return null;
  return quantity * (entry.enteredUnit === "kg" || entry.enteredUnit === "L" ? 1000 : 1);
};

export const confirmedPhysicalCountPreview = (entry: PhysicalCountEntry, canonicalUnit: string) =>
  entry.confirmed === false ? null : normalizePhysicalCountPreview(entry, canonicalUnit);

export const editPhysicalCountEntryQuantity = (entry: PhysicalCountEntry, quantity: string): PhysicalCountEntry => ({
  ...entry,
  quantity,
  confirmed: quantity.trim() !== "",
});

export const physicalCountPreviewVariance = (
  expectedQuantity: number,
  actualQuantity: number,
) => actualQuantity - expectedQuantity;

export const displayedPhysicalCountVariance = (
  countType: InventoryCountType,
  expectedQuantity: number,
  actualQuantity: number | null,
) => actualQuantity === null
  ? null
  : physicalCountPreviewVariance(expectedQuantity, actualQuantity);

export const physicalCountVarianceLabel = (countType:InventoryCountType, variance:number|null) => variance === null
  ? "Not counted"
  : Math.abs(variance) < 0.0001
    ? "Matched"
    : `${countType === "OPENING" ? "Opening " : ""}${variance < 0 ? "Shortage" : "Excess"}`;

export const previousClosingCopyMessage = (countDate: string) =>
  `Values copied from the previous Closing Count on ${countDate}. Review and confirm them before submitting.`;

export const previousPhysicalCopyMessage = (source:PhysicalInventoryCountReference) =>
  `Values copied from ${source.countNo} (${source.countType === "FULL" ? "Full Physical" : source.countType === "CLOSING" ? "Closing" : "Opening"} Count) on ${source.countDate}. Review and confirm them before submitting.`;

export const fullCountCopySourceMessage = (source:PhysicalInventoryCountReference,fallbackDate:string) =>
  `Copied from finalized ${source.countType} checkpoint ${source.countNo} · ${source.countDate ?? fallbackDate} · ${formatAppDate(source.effectiveAt ?? source.submittedAt,true)}. Blank ingredients were not in the source and must be entered. Copied values are not physically verified until you confirm below.`;

export const copyPreviousClosingEntries = (
  items: ExpectedInventoryItem[],
  previousClosingItems: DailyInventoryCountContext["previousClosingItems"],
) => {
  const copied = new Map(previousClosingItems.map((item) => [item.inventoryItemId, item.actualQuantity]));
  return Object.fromEntries(items.map((item) => [
    item.inventoryItemId,
    copied.has(item.inventoryItemId)
      ? physicalCountEntryFromCanonical(copied.get(item.inventoryItemId)!, item.unit)
      : blankPhysicalCountEntry(item.unit),
  ]));
};

export const confirmPhysicalCountCopy = (counted:number,confirmReplace:()=>boolean) =>
  counted === 0 || confirmReplace();

export const copySameDayClosingEntries = (
  items: ExpectedInventoryItem[],
  closingItems: FullInventoryCountContext["sameDayClosingItems"],
) => copyPreviousClosingEntries(items, closingItems.map((item) => ({ ...item, countDate: "" })));

export const mergeOpeningCorrectionEntries = (
  eligibleItems: ExpectedInventoryItem[],
  recordedItems: Array<{ inventoryItemId: string; actualQuantity: number; unit: string }>,
) => {
  const recorded = new Map(recordedItems.map((item) => [item.inventoryItemId, item]));
  return Object.fromEntries(eligibleItems.map((item) => {
    const saved = recorded.get(item.inventoryItemId);
    return [
      item.inventoryItemId,
      saved
        ? physicalCountEntryFromCanonical(saved.actualQuantity, item.unit)
        : blankPhysicalCountEntry(item.unit),
    ];
  }));
};

export const fullCountSubmissionBlockReason = (context: FullInventoryCountContext | null) => {
  if (!context?.closingCount) return "Submit the same-day Closing Count before recording the Full Physical Count.";
  if (context.fullCount) return `Full Physical Count ${context.fullCount.countNo} has already been recorded for this date.`;
  if (context.weeklyFullCount >= context.weeklyFullLimit) return "This branch has reached the limit of three Full Physical Counts for this Monday-Sunday week.";
  return null;
};

export const inventoryCountColumns = (countType: InventoryCountType) => countType === "FULL"
  ? ["SKU", "Ingredient", "Previous Actual", "Received", "Recipe Consumption", "Expected Stock", "Physical Count", "Preview Variance"]
  : ["SKU", "Ingredient", "Previous Actual", "Received", "Recipe Consumption", "Expected Stock", "Opening Count", "Closing Count", "Preview Variance"];

export const isDailyCountColumnEditable = (countType: InventoryCountType, column: "OPENING" | "CLOSING") =>
  countType !== "FULL" && countType === column;

export const closingPosUsedIngredientIds = (items: ExpectedInventoryItem[], countType: InventoryCountType) =>
  new Set(countType === "CLOSING"
    ? items.filter((item) => Number.isFinite(item.expectedConsumption) && item.expectedConsumption > 0)
      .map((item) => item.inventoryItemId)
    : []);

export const closingPosUsageSummary = (count: number) => count > 0
  ? `${count} ingredient${count === 1 ? "" : "s"} used in POS sales`
  : "No operational POS ingredient usage in this count interval.";

export function PosUsageIndicator() {
  return <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold border-[var(--app-primary)]/25 bg-[var(--app-surface)] text-[var(--app-primary)]">
    <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--app-primary)]" />
    Used in POS Sales
  </span>;
}

export const physicalCountEntryFromCanonical = (
  quantity: number,
  canonicalUnit: string,
): PhysicalCountEntry => {
  const useLargeUnit = quantity >= 1000 && (canonicalUnit === "g" || canonicalUnit === "ml");
  const enteredUnit: PhysicalCountUnit = useLargeUnit
    ? canonicalUnit === "g" ? "kg" : "L"
    : canonicalUnit as PhysicalCountUnit;
  return {
    quantity: String(useLargeUnit ? quantity / 1000 : quantity),
    enteredUnit,
    confirmed: true,
  };
};

export const changePhysicalCountEntryUnit = (
  entry: PhysicalCountEntry,
  canonicalUnit: string,
  nextUnit: PhysicalCountUnit,
): PhysicalCountEntry => {
  if (!allowedPhysicalCountUnits(canonicalUnit).includes(nextUnit)) return entry;
  const normalized = normalizePhysicalCountPreview(entry, canonicalUnit);
  if (normalized === null) return { ...entry, enteredUnit: nextUnit };
  const divisor = nextUnit === "kg" || nextUnit === "L" ? 1000 : 1;
  return { quantity: String(normalized / divisor), enteredUnit: nextUnit, confirmed: entry.confirmed };
};

export const physicalCountCompletion = (
  items: ExpectedInventoryItem[],
  entries: Record<string, PhysicalCountEntry>,
) => {
  const remainingItems = items.filter((item) =>
    confirmedPhysicalCountPreview(entries[item.inventoryItemId] ?? blankPhysicalCountEntry(item.unit), item.unit) === null
  );
  return { counted: items.length - remainingItems.length, remaining: remainingItems.length, remainingItems };
};

export const buildPhysicalCountItems = (
  items: ExpectedInventoryItem[],
  entries: Record<string, PhysicalCountEntry>,
) => items.map((item) => {
  const entry = entries[item.inventoryItemId]!;
  return {
    inventoryItemId: item.inventoryItemId,
    quantity: Number(entry.quantity),
    enteredUnit: entry.enteredUnit,
  };
});

export const buildEnteredPhysicalCountItems = (
  items: ExpectedInventoryItem[],
  entries: Record<string, PhysicalCountEntry>,
) => items.flatMap((item) => {
  const entry = entries[item.inventoryItemId] ?? blankPhysicalCountEntry(item.unit);
  return confirmedPhysicalCountPreview(entry,item.unit) === null ? [] : [{
    inventoryItemId:item.inventoryItemId,quantity:Number(entry.quantity),enteredUnit:entry.enteredUnit,
  }];
});

export const validPhysicalCountEntries = (
  items: ExpectedInventoryItem[],
  entries: Record<string, PhysicalCountEntry>,
) => items.every((item) => confirmedPhysicalCountPreview(entries[item.inventoryItemId] ?? blankPhysicalCountEntry(item.unit), item.unit) !== null);

export const canLeavePhysicalCountEntry = (
  hasUnsavedChanges: boolean,
  confirmLeave: () => boolean,
) => !hasUnsavedChanges || confirmLeave();

export function PhysicalCountBackAction({ onBack, label="Back to Count History" }: { onBack: () => void; label?:string }) {
  return <Btn variant="outline" size="sm" icon={ArrowLeft} onClick={onBack}>{label}</Btn>;
}

export const physicalCountCorrectionReasonError = (reason:string) => reason.trim().length >= 10 ? "" : "Reason for Correction must be at least 10 characters.";

export function PhysicalCountCorrectionDialog({countType,reason,error,busy,onReasonChange,onCancel,onConfirm}:{
  countType:InventoryCountType;reason:string;error:string;busy:boolean;onReasonChange:(reason:string)=>void;onCancel:()=>void;onConfirm:()=>void;
}) {
  const countLabel=countType==="OPENING"?"Opening Count":countType==="CLOSING"?"Closing Count":"Full Physical Count";
  return <ControlledActionDialog
    title={`Confirm ${countLabel} Correction`}
    description="You are correcting an existing physical count. The original evidence remains preserved and this correction will be recorded in the audit history."
    confirmLabel="Confirm Correction"
    confirmVariant="primary"
    value={{reason,currentPassword:""}}
    busy={busy}
    requireCurrentPassword={false}
    minReasonLength={10}
    maxReasonLength={1000}
    reasonLabel="Reason for Correction"
    reasonPlaceholder="Explain why this count needs correction"
    error={error}
    showCloseButton
    onChange={(value)=>onReasonChange(value.reason)}
    onCancel={onCancel}
    onConfirm={onConfirm}
  />;
}

export function InventoryCountPage({ onSubmitted, onBackToHistory, countType="FULL", embedded=false, editCountId=null }: { onSubmitted?: () => void; onBackToHistory?: () => void; countType?:InventoryCountType; embedded?:boolean; editCountId?:string|null }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedCountId = editCountId ?? params.get("editCount");
  const currentBusinessDate = businessDate();
  const [countDate, setCountDate] = useState(() => countType === "FULL" ? initialPhysicalCountDate(params.get("countDate"), currentBusinessDate) : currentBusinessDate);
  const [expected, setExpected] = useState<ExpectedInventoryItem[]>([]);
  const [unavailable, setUnavailable] = useState<UnavailableInventoryCountItem[]>([]);
  const [entries, setEntries] = useState<Record<string, PhysicalCountEntry>>({});
  const [submitted, setSubmitted] = useState<{ id: string; countNo: string; items: CountVarianceItem[] } | null>(null);
  const [editingCountId, setEditingCountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [completionFilter, setCompletionFilter] = useState<PhysicalCountCompletionFilter>("ALL");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [dailyContext,setDailyContext]=useState<DailyInventoryCountContext|null>(null);
  const [fullContext,setFullContext]=useState<FullInventoryCountContext|null>(null);
  const [fullPhysicalVerificationConfirmed,setFullPhysicalVerificationConfirmed]=useState(false);
  const [copiedPhysicalSource,setCopiedPhysicalSource]=useState<PhysicalInventoryCountReference|null>(null);
  const [copiedStartingStock,setCopiedStartingStock]=useState(false);
  const [openingQuantities,setOpeningQuantities]=useState<Record<string,number>>({});
  const [closingQuantities,setClosingQuantities]=useState<Record<string,number>>({});
  const [previewing,setPreviewing]=useState(false);
  const [openingMode,setOpeningMode]=useState<"ENTRY"|"SUMMARY"|"EDIT">(countType==="OPENING"&&requestedCountId?"SUMMARY":"ENTRY");
  const [openingRecordedItems,setOpeningRecordedItems]=useState<Array<ExpectedInventoryItem & CountVarianceItem>>([]);
  const [openingCanEdit,setOpeningCanEdit]=useState(false);
  const [openingEditBlockReason,setOpeningEditBlockReason]=useState<string|null>(null);
  const [reloadRevision,setReloadRevision]=useState(0);
  const [correctionDialogOpen,setCorrectionDialogOpen]=useState(false);
  const [correctionReason,setCorrectionReason]=useState("");
  const [correctionDialogError,setCorrectionDialogError]=useState("");
  const correctionSubmittingRef=useRef(false);
  const completion = useMemo(() => physicalCountCompletion(expected, entries), [entries, expected]);
  const visibleItems = useMemo(
    () => filterPhysicalCountItems(expected, search, completionFilter, entries),
    [completionFilter, entries, expected, search],
  );
  const posUsedIngredientIds = useMemo(
    () => closingPosUsedIngredientIds(expected, countType),
    [countType, expected],
  );
  const openingSummary=countType==="OPENING"&&Boolean(requestedCountId)&&openingMode==="SUMMARY";
  const openingEditing=countType==="OPENING"&&openingMode==="EDIT";
  const activeDailyCount=editingCountId?null:countType==="OPENING"?dailyContext?.openingCount:countType==="CLOSING"?dailyContext?.closingCount:null;
  const fullBlockReason=countType==="FULL"&&!editingCountId?fullCountSubmissionBlockReason(fullContext):null;

  const loadExpected = async () => {
    setLoading(true); setError(""); setSubmitted(null); setEditingCountId(null); setUnavailable([]); setDailyContext(null); setFullContext(null); setFullPhysicalVerificationConfirmed(false); setCopiedPhysicalSource(null);
    try {
      if (requestedCountId) {
        const count = await inventoryWorkflowService.count(requestedCountId);
        if (count.countType !== countType) throw new Error(`This is a ${count.countType.toLowerCase()} count. Open it from Stock History to use the correct correction form.`);
        if (countType === "OPENING") {
          setCountDate(count.countDate);
          setExpected(count.items);
          setOpeningRecordedItems(count.items);
          setOpeningQuantities(savedCountQuantities(count.items));
          setClosingQuantities({});
          setEntries(Object.fromEntries(count.items.map((item) => [item.inventoryItemId, physicalCountEntryFromCanonical(item.actualQuantity, item.unit)])));
          setOpeningCanEdit(count.canEdit);
          setOpeningEditBlockReason(count.editBlockReason);
          setOpeningMode("SUMMARY");
          setHasUnsavedChanges(false);
          return;
        }
        if (!count.canEdit) throw new Error(count.editBlockReason??"This count is locked because newer inventory activity or a linked investigation prevents correction.");
        setCountDate(count.countDate); setExpected(count.items);
        setEntries(Object.fromEntries(count.items.map(item => [item.inventoryItemId,physicalCountEntryFromCanonical(item.actualQuantity, item.unit)])));
        setEditingCountId(count.id);
        setHasUnsavedChanges(false);
        return;
      }
      const data = await inventoryWorkflowService.expected(countDate,undefined,countType);
      setExpected(data.items);
      setUnavailable(data.unavailableItems ?? []);
      const nextDailyContext = data.countType === "FULL" ? null : data;
      const nextFullContext = data.countType === "FULL" ? data : null;
      setDailyContext(nextDailyContext);
      setFullContext(nextFullContext);
      const [opening,closing]=await Promise.all([
        nextDailyContext?.openingCount?inventoryWorkflowService.count(nextDailyContext.openingCount.id):Promise.resolve(null),
        nextDailyContext?.closingCount?inventoryWorkflowService.count(nextDailyContext.closingCount.id):Promise.resolve(null),
      ]);
      setOpeningQuantities(savedCountQuantities(opening?.items ?? []));
      setClosingQuantities(savedCountQuantities(closing?.items ?? []));
      setEntries(initialPhysicalCountEntries(data.items,countType));
      setCompletionFilter("ALL");
      setCopiedStartingStock(false);
      setHasUnsavedChanges(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to calculate expected inventory"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadExpected(); }, [countDate, requestedCountId, countType, reloadRevision]);

  const beginOpeningEdit = async () => {
    if (!requestedCountId || !openingCanEdit) return;
    setLoading(true); setError("");
    try {
      const data = await inventoryWorkflowService.expected(countDate,undefined,"OPENING");
      if (data.countType === "FULL") throw new Error("Unable to load the Opening Count correction context.");
      setExpected(data.items);
      setUnavailable(data.unavailableItems ?? []);
      setDailyContext(data);
      setEntries(mergeOpeningCorrectionEntries(data.items,openingRecordedItems));
      setEditingCountId(requestedCountId);
      setOpeningMode("EDIT");
      setCompletionFilter("ALL");
      setHasUnsavedChanges(false);
      setPreviewing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to prepare the Opening Count correction");
    } finally { setLoading(false); }
  };

  const cancelEdit = () => {
    if (!canLeavePhysicalCountEntry(hasUnsavedChanges, () => window.confirm("Discard unsaved physical-count changes and return?"))) return;
    if (openingEditing) {
      setEditingCountId(null);
      setOpeningMode("SUMMARY");
      setHasUnsavedChanges(false);
      setReloadRevision((value) => value + 1);
      return;
    }
    setEditingCountId(null);
    const nextParams = new URLSearchParams(params);
    nextParams.delete("editCount");
    nextParams.delete("countType");
    setParams(nextParams, { replace: true });
    setHasUnsavedChanges(false);
    if (onBackToHistory) {
      onBackToHistory();
      return;
    }
    setCountDate(businessDate());
  };

  const backToHistory = () => {
    if (!canLeavePhysicalCountEntry(hasUnsavedChanges, () => window.confirm("Discard unsaved physical-count changes and return?"))) return;
    const nextParams = new URLSearchParams(params);
    nextParams.delete("editCount");
    nextParams.delete("countType");
    nextParams.delete("countDate");
    setParams(nextParams, { replace: true });
    setHasUnsavedChanges(false);
    if (onBackToHistory) onBackToHistory();
    else navigate("/inventory/physical-count-history");
  };

  const closeCorrectionDialog = () => {
    if (saving) return;
    setCorrectionDialogOpen(false);
    setCorrectionReason("");
    setCorrectionDialogError("");
  };

  const finishSubmission = (count:{id:string;countNo:string;items:CountVarianceItem[]}, corrected:boolean) => {
    if (!onSubmitted) setSubmitted({ id: count.id, countNo: count.countNo, items: count.items });
    toast.success(corrected
      ? "Physical count corrections saved"
      : countType === "OPENING"
        ? "Opening Count submitted"
        : "Physical count submitted and variances calculated automatically");
    if (openingEditing) {
      setEditingCountId(null);
      setOpeningMode("SUMMARY");
      setHasUnsavedChanges(false);
      setPreviewing(false);
      setReloadRevision((value) => value + 1);
    } else {
      setEditingCountId(null);
      setParams({}, { replace: true });
      onSubmitted?.();
    }
  };

  const confirmCorrection = async () => {
    if (!editingCountId || saving || correctionSubmittingRef.current) return;
    const reasonError=physicalCountCorrectionReasonError(correctionReason);
    if(reasonError){setCorrectionDialogError(reasonError);return;}
    correctionSubmittingRef.current=true;setSaving(true);setCorrectionDialogError("");
    try {
      const items=countType==="FULL"?buildPhysicalCountItems(expected,entries):buildEnteredPhysicalCountItems(expected,entries);
      const count=await inventoryWorkflowService.updateCount(editingCountId,countDate,items,correctionReason.trim());
      setCorrectionDialogOpen(false);setCorrectionReason("");
      finishSubmission(count,true);
    } catch (reason) {
      setCorrectionDialogError(reason instanceof Error?reason.message:"Unable to save the physical-count correction");
    } finally { correctionSubmittingRef.current=false;setSaving(false); }
  };

  const submit = async () => {
    if (isFutureInventoryCountDate(countDate, currentBusinessDate)) {
      toast.error("Physical counts cannot be recorded for a future date.");
      return;
    }
    const dailyItems=buildEnteredPhysicalCountItems(expected,entries);
    if (countType === "FULL" ? !validPhysicalCountEntries(expected, entries) : dailyItems.length===0) {
      toast.error(countType === "FULL" ? "Enter a valid non-negative physical count and compatible unit for every item." : "Enter at least one valid ingredient quantity. Blank ingredients remain unchanged.");
      return;
    }
    if(countType==="FULL"&&!editingCountId&&!fullPhysicalVerificationConfirmed){
      toast.error("Confirm that every Full Physical Count quantity was physically verified.");
      return;
    }
    if(countType==="FULL"&&fullBlockReason){
      toast.error(fullBlockReason);
      return;
    }
    if(countType==="CLOSING"&&(!dailyContext?.openingCount||!dailyContext.posDayComplete)){
      toast.error(!dailyContext?.openingCount?"Submit today's Opening Count before Closing Count.":"Import and confirm the complete end-of-day POS report before Closing Count.");
      return;
    }
    if(countType!=="FULL"&&!previewing&&!openingEditing){setPreviewing(true);return;}
    if(editingCountId){setCorrectionDialogError("");setCorrectionDialogOpen(true);return;}
    setSaving(true);
    try {
      const items = countType === "FULL" ? buildPhysicalCountItems(expected, entries) : dailyItems;
      const count = await inventoryWorkflowService.submitCount(countDate, items,countType);
      finishSubmission(count,false);
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to submit inventory count"); }
    finally { setSaving(false); }
  };

  if (loading) return <PhysicalCountLoadingSkeleton countType={countType}/>;
  if (error) return (
    <div className="p-16 text-center">
      <p className="text-sm mb-3" style={{ color: "var(--app-danger)" }}>{error}</p>
      <div className="flex justify-center gap-3">
        <button onClick={() => void loadExpected()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold" style={{ borderColor: "var(--app-border)" }}>
          <RefreshCw size={14} />Retry
        </button>
        {requestedCountId && (
          <button onClick={cancelEdit} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--app-primary)" }}>
            Back to Count History
          </button>
        )}
        {!embedded&&<PhysicalCountBackAction onBack={backToHistory} label={countType==="FULL"?"Back to Count History":"Back to Operations"}/>}
      </div>
    </div>
  );

  return <div className={embedded?"space-y-5":"p-4 md:p-6 space-y-5"}>
    {correctionDialogOpen&&(
      <PhysicalCountCorrectionDialog countType={countType} reason={correctionReason} error={correctionDialogError} busy={saving} onReasonChange={(reason)=>{setCorrectionReason(reason);setCorrectionDialogError("");}} onCancel={closeCorrectionDialog} onConfirm={()=>void confirmCorrection()}/>
    )}
    {!embedded&&<div>
      <PhysicalCountBackAction onBack={backToHistory} label={countType==="FULL"?"Back to Count History":"Back to Operations"}/>
    </div>}
    {!embedded&&<div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold" style={{ color: "var(--app-text)" }}>
            {editingCountId ? "Correct Physical Count" : "Physical Count"}
          </h1>
          {editingCountId && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "var(--app-primary-faint)", color: "var(--app-primary)" }}>
              Correction Mode
            </span>
          )}
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>
          {editingCountId
            ? "Revising saved physical count. Update the recorded quantities and save your corrections."
            : "Record and verify the physical stock available at the branch. Expected stock remains system-calculated."}
        </p>
      </div>
      {showInventoryCountDateFilter(countType) && <CalendarDateField label="Count date" value={countDate} max={currentBusinessDate} onChange={setCountDate} disabled={Boolean(editingCountId)}/>}
    </div>}

    {!editingCountId && unavailable.length > 0 && (
      <div className="rounded-2xl border p-4 bg-[var(--app-warning-bg)] border-[var(--app-warning)]" role="status">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--app-warning)]" />
          <div>
            <p className="text-sm font-semibold text-[var(--app-text)]">
              {unavailable.length} item{unavailable.length === 1 ? "" : "s"} unavailable for this count
            </p>
            <p className="mt-1 text-xs text-[var(--app-text-muted)]">
              These items have no valid inventory baseline on or before {countDate}. They are marked No Baseline and will not be included in this count.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {unavailable.map((item) => (
                <span key={item.inventoryItemId} className="rounded-full border px-2.5 py-1 text-xs font-medium bg-[var(--app-surface)] border-[var(--app-border)] text-[var(--app-text)]">
                  {item.sku} · {item.itemName} — No Baseline
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}

    {submitted ? <CountResult countNo={submitted.countNo} items={submitted.items} onEdit={() => { setEntries(Object.fromEntries(submitted.items.map((item) => [item.inventoryItemId, physicalCountEntryFromCanonical(item.actualQuantity, item.unit)]))); setEditingCountId(submitted.id); setSubmitted(null); }} onInvestigate={(item) => item.shrinkageReportId && navigate(`/shrinkage?reportId=${item.shrinkageReportId}`)} onNewCount={() => void loadExpected()} /> : (
      <TableCard
        title={countType==="FULL"?(editingCountId ? "Correct Physical Count" : "Full Physical Count Entry"):openingSummary?"Recorded Opening Count":openingEditing?"Edit Opening Count":undefined}
        subtitle={countType==="FULL"?"Record and verify the physical stock available at the branch. Expected stock remains system-calculated.":undefined}
        badge={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--app-primary-faint)] text-[var(--app-primary)] border border-[var(--app-border)]">
            {expected.length} item{expected.length === 1 ? "" : "s"}
          </span>
        }
        toolbar={<>
          {embedded&&showInventoryCountDateFilter(countType)&&<CalendarDateField label="Count date" value={countDate} max={currentBusinessDate} onChange={setCountDate} disabled={Boolean(editingCountId)}/>}
          <SearchInput placeholder="Search ingredient or SKU…" width={260} value={search} onChange={setSearch}/>
          <Select small value={completionFilter} onChange={(value) => setCompletionFilter(value as PhysicalCountCompletionFilter)} options={[{ value: "ALL", label: "All" }, { value: "COUNTED", label: "Counted" }, { value: "NOT_COUNTED", label: "Not Counted" }]}/>
          <span className="text-xs font-medium text-[var(--app-text-muted)]">Showing {visibleItems.length} of {expected.length} items</span>
          {search && <Btn variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Btn>}
          {countType==="OPENING"&&dailyContext?.latestPhysicalCount&&(dailyContext.latestPhysicalItems?.length??0)>0&&!activeDailyCount&&!requestedCountId?<Btn variant="outline" size="sm" onClick={()=>{if(!confirmPhysicalCountCopy(completion.counted,()=>window.confirm("Replace the quantities currently entered with the latest physical count values?")))return;setEntries(copyPreviousClosingEntries(expected,(dailyContext.latestPhysicalItems??[]).map((item)=>({...item,countDate:dailyContext.latestPhysicalCount!.countDate,countType:dailyContext.latestPhysicalCount!.countType}))));setCopiedPhysicalSource(dailyContext.latestPhysicalCount!);setCopiedStartingStock(false);setHasUnsavedChanges(true);setPreviewing(false);}}>Copy Latest Physical Count</Btn>:null}
          {countType==="FULL"&&fullContext?.latestPhysicalCount&&(fullContext.latestPhysicalItems?.length??0)>0&&!editingCountId?<Btn variant="outline" size="sm" onClick={()=>{if(!confirmPhysicalCountCopy(completion.counted,()=>window.confirm("Replace the quantities currently entered with the latest physical count values?")))return;setEntries(copyPreviousClosingEntries(expected,(fullContext.latestPhysicalItems??[]).map((item)=>({...item,countDate:fullContext.latestPhysicalCount!.countDate,countType:fullContext.latestPhysicalCount!.countType}))));setCopiedPhysicalSource(fullContext.latestPhysicalCount!);setFullPhysicalVerificationConfirmed(false);setHasUnsavedChanges(true);setPreviewing(false);}}>Copy Latest Physical Count</Btn>:null}
          {countType==="OPENING"&&dailyContext?.startingStockCopyEligible&&!activeDailyCount&&!requestedCountId?<Btn variant="outline" size="sm" onClick={()=>{if(completion.counted>0&&!window.confirm("Replace the quantities currently entered with Starting Stock values?"))return;setEntries(copyPreviousClosingEntries(expected,(dailyContext.startingStockItems??[]).map((item)=>({...item,countDate:""}))));setCopiedStartingStock(true);setCopiedPhysicalSource(null);setHasUnsavedChanges(true);setPreviewing(false);}}>Copy Starting Stock</Btn>:null}
          {openingSummary?<div className="ml-auto"><Btn disabled={!openingCanEdit} onClick={()=>void beginOpeningEdit()}>Edit Inventory</Btn></div>:<div className="ml-auto"><Btn icon={Send} disabled={saving || expected.length === 0 || Boolean(activeDailyCount) || (countType==="FULL"&&(Boolean(fullBlockReason)||completion.remaining > 0||(!editingCountId&&!fullPhysicalVerificationConfirmed))) || (countType==="CLOSING"&&(!dailyContext?.openingCount||!dailyContext.posDayComplete))} onClick={() => void submit()}>
            {saving ? "Saving…" : openingEditing ? "Submit Count" : editingCountId ? "Save Corrections" : previewing ? "Confirm and Submit" : activeDailyCount ? `${countType === "OPENING" ? "Opening" : "Closing"} Submitted` : "Submit Count"}
          </Btn></div>}
        </>}
      >
        {countType==="FULL"&&fullBlockReason&&<div className="border-b p-4 text-sm font-medium text-[var(--app-warning)] border-[var(--app-border)] bg-[var(--app-warning-bg)]">{fullBlockReason}</div>}
        {countType!=="FULL"&&<div className="border-b p-4 text-sm text-[var(--app-text-muted)] border-[var(--app-border)] bg-[var(--app-surface-muted)]">{openingSummary?(openingCanEdit?"This read-only summary shows only ingredients explicitly recorded in the submitted Opening Count.":openingEditBlockReason??"This Opening Count is read-only because later inventory activity prevents correction."):countType==="CLOSING"&&!dailyContext?.openingCount?"Closing Count is unavailable until today's Opening Count is submitted.":countType==="CLOSING"&&!dailyContext?.posDayComplete?"Closing Count is unavailable until the reconciled end-of-day POS report is imported and confirmed complete.":activeDailyCount?`${countType === "OPENING" ? "Opening" : "Closing"} Count has already been submitted for this date.`:"Blank ingredients are not counted and remain unchanged. Entered zero is saved as zero."}</div>}
        <div className="border-b p-4" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <strong>{completion.counted} of {expected.length} ingredients counted</strong>
            <span className={completion.remaining ? "text-[var(--app-warning)]" : "text-[var(--app-success)]"}>{countType==="FULL"?`${completion.remaining} remaining`:`${completion.remaining} left blank`}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--app-surface-muted)]" aria-label={`${completion.counted} of ${expected.length} ingredients counted`}>
            <div className="h-full rounded-full bg-[var(--app-primary)] transition-[width]" style={{ width: expected.length ? `${(completion.counted / expected.length) * 100}%` : "0%" }}/>
          </div>
          {countType==="CLOSING"&&<div className="mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-primary)]" role="status">
            {posUsedIngredientIds.size > 0&&<span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[var(--app-primary)]"/>}
            {closingPosUsageSummary(posUsedIngredientIds.size)}
          </div>}
          {countType==="FULL"&&completion.remaining > 0 && <p className="mt-2 text-xs text-[var(--app-text-muted)]">Complete the remaining physical quantities before submitting. Still needed: {completion.remainingItems.slice(0, 5).map((item) => item.itemName).join(", ")}{completion.remaining > 5 ? ` and ${completion.remaining - 5} more` : ""}.</p>}
          {countType==="FULL"&&!editingCountId&&copiedPhysicalSource&&<p className="mt-2 text-xs font-semibold text-[var(--app-primary)]">{fullCountCopySourceMessage(copiedPhysicalSource,countDate)}</p>}
          {countType==="FULL"&&!editingCountId&&<label className="mt-3 flex items-start gap-2 text-xs font-medium text-[var(--app-text)]"><input className="mt-0.5" type="checkbox" checked={fullPhysicalVerificationConfirmed} onChange={(event)=>setFullPhysicalVerificationConfirmed(event.target.checked)}/><span>I physically verified every Full Count quantity, including copied values.</span></label>}
          {copiedPhysicalSource&&countType==="OPENING"&&<p className="mt-2 text-xs font-semibold text-[var(--app-primary)]">{previousPhysicalCopyMessage(copiedPhysicalSource)}</p>}
          {copiedStartingStock&&dailyContext?.startingStockSource&&<p className="mt-2 text-xs font-semibold text-[var(--app-primary)]">Values copied from preserved Starting Stock {dailyContext.startingStockSource.baselineNo} · {formatAppDate(dailyContext.startingStockSource.effectiveAt,true)}. Review and edit them before submitting; no count or stock movement has been created.</p>}
          {countType==="OPENING"&&!requestedCountId&&!dailyContext?.latestPhysicalCount&&<p className="mt-2 text-xs text-[var(--app-text-muted)]">No previous physical count is available. Enter quantities manually.</p>}
          {countType!=="FULL"&&previewing&&<p className="mt-2 text-xs font-semibold text-[var(--app-primary)]">{countType==="OPENING"?"Review the entered Opening quantities, then choose Confirm and Submit. Only entered ingredients will establish checkpoints.":"Preview ready. Review the calculated variances, then choose Confirm and Submit. Only entered ingredients will establish checkpoints."}</p>}
        </div>
        <TableWrapper minWidth={countType==="FULL"?900:1120}>
          <THead cols={inventoryCountColumns(countType)} />
          <tbody>
            {expected.length === 0 ? (
              <TableEmptyRow colSpan={inventoryCountColumns(countType).length} title="No ingredients available" subtitle="No ingredients are configured for physical counting." />
            ) : visibleItems.length === 0 ? (
              <TableEmptyRow colSpan={inventoryCountColumns(countType).length} title="No ingredients found" subtitle="Try a different ingredient name or SKU." />
            ) : (
              visibleItems.map((item) => {
                const usedInPosSales = posUsedIngredientIds.has(item.inventoryItemId);
                const entry = entries[item.inventoryItemId] ?? blankPhysicalCountEntry(item.unit);
                const displayedQuantity = normalizePhysicalCountPreview(entry, item.unit);
                const normalizedActual = confirmedPhysicalCountPreview(entry, item.unit);
                const variance = displayedPhysicalCountVariance(countType, item.expectedQuantity, normalizedActual);
                const countEntry=<div className="flex flex-col items-end gap-1"><div className="flex items-center gap-1.5"><input type="number" min={0} step="any" value={entry.quantity} onChange={(event) => { setHasUnsavedChanges(true); setPreviewing(false); if(countType==="FULL")setFullPhysicalVerificationConfirmed(false); setEntries((current) => ({ ...current, [item.inventoryItemId]: editPhysicalCountEntryQuantity(entry, event.target.value) })); }} placeholder="Not counted" className="min-h-9 w-28 px-2.5 py-1.5 rounded-xl border text-right font-semibold text-sm outline-none transition-colors border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-text)] focus:border-[var(--app-primary)] focus:ring-2 focus:ring-[var(--app-primary-faint)]" aria-label={`${item.itemName} ${countType.toLowerCase()} quantity`}/><Select small value={entry.enteredUnit} onChange={(value) => { if(entry.confirmed!==false)setHasUnsavedChanges(true); setPreviewing(false); if(countType==="FULL")setFullPhysicalVerificationConfirmed(false); setEntries((current) => ({ ...current, [item.inventoryItemId]: changePhysicalCountEntryUnit(entry, item.unit, value as PhysicalCountUnit) })); }} className="w-20 [&_.custom-select-trigger]:!min-w-0" ariaLabel={`${item.itemName} physical count unit`} options={allowedPhysicalCountUnits(item.unit).map((unit) => ({ value: unit, label: unit }))}/></div><div className="flex items-center gap-2 text-[10px] text-[var(--app-text-muted)]"><span className="whitespace-nowrap">{entry.quantity.trim() === ""?"Not yet counted":displayedQuantity === null?"Enter a valid non-negative quantity":entry.confirmed===false?"Suggested from Expected Stock · Edit to count":`Converted to system unit: ${displayedQuantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${item.unit}`}</span></div></div>;
                const savedQuantity=(value:number|undefined)=>value===undefined?<span className="text-[var(--app-text-muted)]">—</span>:<span className="font-semibold">{value.toLocaleString("en-PH",{maximumFractionDigits:4})} {item.unit}</span>;
                return (
                  <TR key={item.inventoryItemId} className={usedInPosSales?"bg-[var(--app-primary-faint)]":""}>
                    <TD mono><span className="font-semibold text-[var(--app-primary)]">{item.sku}</span></TD>
                    <TD><div className="flex min-w-0 flex-wrap items-center gap-2"><span className="font-semibold text-[var(--app-text)]">{item.itemName}</span>{usedInPosSales&&<PosUsageIndicator/>}</div></TD>
                    <TD right muted>{item.previousActualQuantity.toFixed(2)} {item.unit}</TD>
                    <TD right muted>{item.stockReceived.toFixed(2)} {item.unit}</TD>
                    <TD right><span className="font-medium text-[var(--app-primary)]">−{item.expectedConsumption.toFixed(2)} {item.unit}</span></TD>
                    <TD right><span className="font-bold text-[var(--app-text)]">{item.expectedQuantity.toFixed(2)} {item.unit}</span></TD>
                    {countType==="FULL"?<TD right>{countEntry}</TD>:<><TD right>{isDailyCountColumnEditable(countType,"OPENING")&&!activeDailyCount&&!openingSummary?countEntry:savedQuantity(openingQuantities[item.inventoryItemId])}</TD><TD right>{isDailyCountColumnEditable(countType,"CLOSING")&&!activeDailyCount?countEntry:savedQuantity(closingQuantities[item.inventoryItemId])}</TD></>}
                    <TD right>
                      <span
                        className="font-bold text-sm"
                        style={{
                          color: variance === null ? "var(--app-text-muted)" : Math.abs(variance) < 0.0001
                            ? "var(--app-success)"
                            : variance < 0
                              ? "var(--app-danger)"
                              : "var(--app-info)",
                        }}
                      >
                        {variance === null ? "—" : <>{variance > 0 ? "+" : ""}{variance.toFixed(2)} {item.unit}<span className="mt-0.5 block text-[10px] font-semibold">{physicalCountVarianceLabel(countType,variance)}</span></>}
                      </span>
                    </TD>
                  </TR>
                );
              })
            )}
          </tbody>
        </TableWrapper>
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-t bg-[var(--app-surface)]" style={{ borderColor: "var(--app-border)" }}>
          <p className="text-xs text-[var(--app-text-muted)] max-w-md">
            {countType==="OPENING"?<>Opening preview compares expected stock with the entered actual quantity. On submission, the server records any material Opening discrepancy and resets actual stock to the submitted Opening quantity. {PHYSICAL_COUNT_INVESTIGATION_GUIDANCE}</>:<>Variance and possible shrinkage are calculated by the server. {PHYSICAL_COUNT_INVESTIGATION_GUIDANCE}</>}
          </p>
          <div className="flex items-center gap-2">
            {editingCountId && (
              <Btn variant="outline" onClick={cancelEdit}>
                {openingEditing?"Cancel Editing":"Cancel Correction"}
              </Btn>
            )}
          </div>
        </div>
      </TableCard>
    )}
  </div>;
}

function CountResult({ countNo, items, onEdit, onInvestigate, onNewCount }: { countNo: string; items: CountVarianceItem[]; onEdit: () => void; onInvestigate: (item: CountVarianceItem) => void; onNewCount: () => void }) {
  const variances = items.filter((item) => Math.abs(item.varianceQuantity) > 0.0001);
  return <div className="space-y-4">
    <div className="flex items-center justify-between p-4 rounded-2xl border" style={{ borderColor: variances.length ? "var(--app-warning)" : "var(--app-success)", background: variances.length ? "var(--app-warning-bg)" : "var(--app-success-bg)" }}><div className="flex items-center gap-3">{variances.length ? <AlertTriangle style={{ color: "var(--app-warning)" }} /> : <CheckCircle style={{ color: "var(--app-success)" }} />}<div><h2 className="font-bold">{variances.length ? "System-Calculated Variance Detected" : "Inventory Count Matched"}</h2><p className="text-xs mt-0.5" style={{ color: "var(--app-text-muted)" }}>{countNo} · {variances.length} item{variances.length === 1 ? "" : "s"} differ from expected stock</p></div></div><div className="flex gap-2"><button onClick={onEdit} className="px-3 py-2 rounded-xl border text-xs font-semibold" style={{ borderColor: "var(--app-primary)", color: "var(--app-primary)", background: "var(--app-surface)" }}>Edit Count</button><button onClick={onNewCount} className="px-3 py-2 rounded-xl border text-xs font-semibold" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>New Count</button></div></div>
    <div className="grid gap-3">{items.map((item) => <div key={item.id} className="p-4 rounded-2xl border flex items-center gap-4" style={{ borderColor: item.requiresInvestigation ? "var(--app-danger)" : "var(--app-border)", background: "var(--app-surface)" }}><ClipboardList size={18} style={{ color: item.requiresInvestigation ? "var(--app-danger)" : item.varianceQuantity < 0 ? "var(--app-danger)" : item.varianceQuantity > 0 ? "var(--app-info)" : "var(--app-text-faint)" }} /><div className="flex-1"><div className="font-semibold">{item.itemName}</div><div className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Expected {item.expectedQuantity.toFixed(2)}{item.unit} · Actual {item.actualQuantity.toFixed(2)}{item.unit}</div></div><div className="text-right"><div className="font-bold" style={{ color: item.varianceQuantity < 0 ? "var(--app-danger)" : item.varianceQuantity > 0 ? "var(--app-info)" : "var(--app-text-muted)" }}>{item.varianceQuantity > 0 ? "+" : ""}{item.varianceQuantity.toFixed(2)}{item.unit}</div><div className="text-[10px]" style={{ color: "var(--app-text-faint)" }}>{item.varianceValue > 0 ? "+" : ""}₱{item.varianceValue.toFixed(2)}</div></div>{item.requiresInvestigation && <button onClick={() => onInvestigate(item)} className="px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: "var(--app-primary)" }}>Investigate Anomaly</button>}</div>)}</div>
  </div>;
}
