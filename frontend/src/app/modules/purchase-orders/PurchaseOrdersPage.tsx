import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Eye, Inbox, PackageCheck, Plus, RefreshCw, Send, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { Btn, C, CalendarDateField, KPICard, Pagination, SearchInput, SectionHeader, Select, StatusChip, TableCard, TableEmptyRow, TableLoadingRow, TableWrapper, TD, THead, TR } from "../../components/ModuleUi";
import { masterDataService } from "../../services/masterData.service";
import { operationsService } from "../../services/operations.service";
import type { Branch, InventoryItem } from "../../types/masterData";
import type { PurchaseOrder, PurchaseOrderStatus } from "../../types/operations";
import type { Role } from "../../types/navigation";
import { IngredientEditorModal } from "../menu-recipes/MenuRecipesPage";
import { formatAppCurrency, formatAppDate } from "../../utils/appPreferences";
import { businessDate } from "../../utils/businessDate";

const peso = formatAppCurrency;
const chip: Record<PurchaseOrderStatus, string> = { DRAFT: "draft", ORDERED: "ordered", PARTIALLY_RECEIVED: "partially_received", RECEIVED: "received", CANCELLED: "cancelled" };
const statuses: (PurchaseOrderStatus | "ALL")[] = ["ALL", "DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"];
const prettyStatus = (value: string) => value === "ALL" ? "All Statuses" : value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function PurchaseOrders({ role, scopeBranchId = "ALL" }: { role: Role; scopeBranchId?: string }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState(scopeBranchId);
  const [status, setStatus] = useState<PurchaseOrderStatus | "ALL">("ALL");
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [prefillItem, setPrefillItem] = useState<{ ingredientId: string; quantity: string } | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setCreating(true);
      const ingredientId = searchParams.get("ingredientId") || "";
      const quantity = searchParams.get("quantity") || "";
      if (ingredientId) {
        setPrefillItem({ ingredientId, quantity });
      }
    }
  }, [searchParams]);

  const closeCreate = () => {
    setCreating(false);
    setPrefillItem(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("create");
      next.delete("ingredientId");
      next.delete("quantity");
      return next;
    }, { replace: true });
  };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextOrders, nextBranches, nextInventory] = await Promise.all([
        operationsService.purchaseOrders(), role === "owner" ? masterDataService.branches() : Promise.resolve([]), role === "manager" ? masterDataService.inventoryItems() : Promise.resolve([]),
      ]);
      setOrders(nextOrders); setBranches(nextBranches); setInventory(nextInventory);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load purchase orders."); }
    finally { setLoading(false); }
  }, [role]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (role === "owner") setBranchId(scopeBranchId); }, [role, scopeBranchId]);
  const filtered = useMemo(() => orders.filter((order) => {
    const q = search.trim().toLowerCase();
    return (!q || `${order.poNo} ${order.supplierName} ${order.branchName}`.toLowerCase().includes(q))
      && (branchId === "ALL" || order.branchId === branchId) && (status === "ALL" || order.status === status);
  }), [branchId, orders, search, status]);
  const suppliers = useMemo(() => [...new Set(orders.map((order) => order.supplierName.trim()).filter(Boolean))].sort(), [orders]);
  const setOrderStatus = async (order: PurchaseOrder, next: "ORDERED" | "CANCELLED") => {
    try { await operationsService.updatePurchaseOrderStatus(order.id, next); toast.success(next === "ORDERED" ? "Purchase order marked as ordered" : "Purchase order cancelled"); setSelected(null); await load(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to update purchase order."); }
  };

  return <div className="p-4 md:p-6 space-y-5">
    <SectionHeader title={role === "owner" ? "Purchase Order Monitoring" : "Purchase Orders"} sub={role === "owner" ? "Monitor branch orders and receiving progress; no Owner approval is required." : "Create orders and confirm received inventory for your assigned branch."} actions={<>
      <Btn variant="outline" icon={RefreshCw} onClick={() => void load()}>Refresh</Btn>{role === "manager" && <Btn icon={Plus} onClick={() => { setPrefillItem(null); setCreating(true); }}>New Purchase Order</Btn>}
    </>}/>
    {error && <div className="rounded-xl border p-4 text-sm" style={{ borderColor: C.red, background: C.redBg, color: C.red }}>{error}</div>}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KPICard label="Open Orders" value={String(orders.filter((o) => o.status === "ORDERED" || o.status === "PARTIALLY_RECEIVED").length)} sub="Awaiting full receipt" icon={ShoppingCart} color={C.maroon}/>
      <KPICard label="Received" value={String(orders.filter((o) => o.status === "RECEIVED").length)} sub="Completed purchase orders" icon={PackageCheck} color={C.green}/>
      <KPICard label="Order Value" value={peso(orders.filter((o) => o.status !== "CANCELLED").reduce((sum, o) => sum + o.totalAmount, 0))} sub="Excludes cancelled orders" icon={ShoppingCart} color={C.blue}/>
    </div>
    <TableCard
      title={role === "owner" ? "Purchase Order Registry" : "Purchase Orders"}
      subtitle={role === "owner" ? "Monitor branch procurement lifecycle, delivery fulfillment, and receiving records" : "Manage branch procurement, order approvals, and delivery fulfillment"}
      badge={<span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">{filtered.length} orders</span>}
      toolbar={<>
        <SearchInput placeholder="Search PO, supplier, or branch…" width={270} value={search} onChange={setSearch}/>
        {role === "owner" && <Select value={branchId} onChange={setBranchId} options={[{ value: "ALL", label: "All Branches" }, ...branches.map((item) => ({ value: item.id, label: item.name }))]}/>}
        <Select value={status} onChange={(value) => setStatus(value as PurchaseOrderStatus | "ALL")} options={statuses.map((value) => ({ value, label: prettyStatus(value) }))}/>
      </>}
    >
      <TableWrapper minWidth={860}>
        <THead cols={role === "owner" ? ["PO Number", "Branch", "Supplier", "Created By", "Order Date", "Expected Delivery", "Items", "Total", "Status", "Action"] : ["PO Number", "Supplier", "Order Date", "Expected Delivery", "Items", "Total", "Status", "Action"]}/>
        <tbody>
          {loading && <TableLoadingRow colSpan={role === "owner" ? 10 : 8} label="Loading purchase orders…" />}
          {!loading && filtered.length === 0 && (
            <TableEmptyRow
              colSpan={role === "owner" ? 10 : 8}
              title="No purchase orders found"
              subtitle={role === "manager" ? "Create a purchase order to start monitoring weekly procurement." : "Branch purchase orders will appear here."}
            />
          )}
          {!loading && filtered.map((order) => <TR key={order.id}>
            <TD mono><span className="font-bold" style={{ color: C.maroon }}>{order.poNo}</span></TD>
            {role === "owner" && <TD muted>{order.branchName}</TD>}
            <TD><span className="font-medium">{order.supplierName}</span></TD>
            {role === "owner" && <TD muted>{order.createdByName}</TD>}
            <TD muted>{formatAppDate(order.orderDate)}</TD>
            <TD muted>{formatAppDate(order.expectedDeliveryDate)}</TD>
            <TD right>{order.itemCount}</TD>
            <TD right bold>{peso(order.totalAmount)}</TD>
            <TD center><StatusChip status={chip[order.status]}/></TD>
            <TD center>
              <button className="p-2 rounded-lg hover:bg-[var(--app-surface-muted)] text-[var(--app-primary)] transition-colors" aria-label={`View ${order.poNo}`} onClick={() => setSelected(order)}>
                <Eye size={15}/>
              </button>
            </TD>
          </TR>)}
        </tbody>
      </TableWrapper>
      <Pagination total={filtered.length} page={1} perPage={Math.max(filtered.length, 1)}/>
    </TableCard>
    {creating && (
      <CreatePurchaseOrder
        inventory={inventory}
        suppliers={suppliers}
        initialItem={prefillItem}
        onInventoryCreated={(item) => setInventory((current) => [...current, item].sort((a, b) => a.name.localeCompare(b.name)))}
        onClose={closeCreate}
        onCreated={() => {
          closeCreate();
          void load();
        }}
      />
    )}
    {selected && <OrderDetail order={selected} role={role} onClose={() => setSelected(null)} onOrder={() => void setOrderStatus(selected, "ORDERED")} onCancel={() => void setOrderStatus(selected, "CANCELLED")} onReceive={() => { setReceiving(selected); setSelected(null); }}/>}
    {receiving && <ReceiveOrder order={receiving} onClose={() => setReceiving(null)} onReceived={() => { setReceiving(null); void load(); }}/>}
  </div>;
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.45)" }}><div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border p-6" style={{ background: C.surface, borderColor: C.border }}><div className="flex items-center justify-between mb-5"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} className="p-2 rounded-lg bg-[var(--app-surface-muted)]" aria-label="Close"><X size={15}/></button></div>{children}</div></div>;
}

function CreatePurchaseOrder({
  inventory,
  suppliers,
  initialItem,
  onInventoryCreated,
  onClose,
  onCreated,
}: {
  inventory: InventoryItem[];
  suppliers: string[];
  initialItem?: { ingredientId: string; quantity: string } | null;
  onInventoryCreated: (item: InventoryItem) => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [supplierChoice, setSupplierChoice] = useState("");
  const [otherSupplier, setOtherSupplier] = useState("");
  const [orderDate, setOrderDate] = useState(businessDate());
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState(() => {
    if (initialItem && initialItem.ingredientId) {
      const match = inventory.find((item) => item.id === initialItem.ingredientId);
      return [{
        inventoryItemId: initialItem.ingredientId,
        quantityOrdered: initialItem.quantity || "",
        unitCost: match ? String(match.unitCost) : "",
      }];
    }
    return [{ inventoryItemId: "", quantityOrdered: "", unitCost: "" }];
  });

  useEffect(() => {
    if (initialItem?.ingredientId) {
      const match = inventory.find((item) => item.id === initialItem.ingredientId);
      if (match) {
        setRows((current) => current.map((row) =>
          row.inventoryItemId === match.id && !row.unitCost
            ? { ...row, unitCost: String(match.unitCost) }
            : row
        ));
      }
    }
  }, [inventory, initialItem]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ingredientTarget, setIngredientTarget] = useState<number | null>(null);
  const update = (index: number, patch: Partial<(typeof rows)[number]>) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const save = async (status: "DRAFT" | "ORDERED") => {
    const supplierName = supplierChoice === "__OTHER__" ? otherSupplier.trim() : supplierChoice.trim();
    const validRows = rows.map((row) => ({ inventoryItemId: row.inventoryItemId, quantityOrdered: Number(row.quantityOrdered), unitCost: Number(row.unitCost) })).filter((row) => row.inventoryItemId && row.quantityOrdered > 0 && row.unitCost >= 0 && rows.every((source) => source.quantityOrdered !== "" && source.unitCost !== ""));
    if (supplierName.trim().length < 2 || !orderDate || !expectedDeliveryDate || validRows.length !== rows.length) { setError("Complete the supplier, dates, and all item details."); return; }
    setSaving(true); setError("");
    try { await operationsService.createPurchaseOrder({ supplierName: supplierName.trim(), orderDate, expectedDeliveryDate, status, notes: notes.trim() || undefined, items: validRows }); toast.success(status === "DRAFT" ? "Purchase order saved as draft" : "Purchase order created"); onCreated(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create purchase order."); }
    finally { setSaving(false); }
  };
  return <ModalShell title="New Purchase Order" onClose={onClose}><div className="grid sm:grid-cols-3 gap-4">
    <label className="sm:col-span-3 text-sm font-medium">Supplier Name<Select className="mt-1.5 w-full" value={supplierChoice} onChange={setSupplierChoice} options={[{value:"",label:"Select supplier"},...suppliers.map((name)=>({value:name,label:name})),{value:"__OTHER__",label:"Others"}]}/></label>
    {supplierChoice === "__OTHER__" && <label className="sm:col-span-3 text-sm font-medium">Specify Supplier<input className="field mt-1.5" value={otherSupplier} onChange={(e) => setOtherSupplier(e.target.value)} placeholder="Enter supplier name" maxLength={160}/></label>}
    <CalendarDateField label="Order Date" value={orderDate} onChange={setOrderDate}/>
    <CalendarDateField label="Expected Delivery" value={expectedDeliveryDate} min={orderDate} onChange={setExpectedDeliveryDate}/>
    <label className="text-sm font-medium">Notes<input className="field mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional"/></label>
  </div><div className="mt-4 rounded-xl border px-4 py-3 text-xs" style={{ borderColor:C.amber,background:C.amberBg,color:C.secondary }}>A physical inventory count for the selected Order Date must be submitted before this PO can be created.</div><div className="mt-5 space-y-2"><div className="grid grid-cols-[1fr_110px_130px_36px] gap-2 text-xs font-bold text-[var(--app-text-muted)]"><span>INGREDIENT</span><span>QUANTITY</span><span>UNIT COST</span><span/></div>
    {rows.map((row, index) => <div className="grid grid-cols-[1fr_110px_130px_36px] gap-2" key={index}><Select className="min-w-0" value={row.inventoryItemId} onChange={(value) => { if(value==="__NEW__"){setIngredientTarget(index);return;} const item=inventory.find((candidate)=>candidate.id===value);update(index,{inventoryItemId:value,unitCost:item?String(item.unitCost):row.unitCost}); }} options={[{ value: "", label: "Select ingredient" }, ...inventory.filter((item)=>item.status==="ACTIVE").map((item) => ({ value: item.id, label: `${item.name} (${item.unit})` })),{value:"__NEW__",label:"+ New Ingredient"}]}/><input className="field" type="number" min="0.001" step="any" value={row.quantityOrdered} placeholder="Enter qty" onChange={(e) => update(index, { quantityOrdered: e.target.value })}/><input className="field" type="number" min="0" step=".01" value={row.unitCost} placeholder="0.00" onChange={(e) => update(index, { unitCost: e.target.value })}/><button disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="rounded-lg border disabled:opacity-30" aria-label="Remove item"><X size={14} className="mx-auto"/></button></div>)}
    <Btn variant="outline" size="sm" icon={Plus} onClick={() => setRows((current) => [...current, { inventoryItemId: "", quantityOrdered: "", unitCost: "" }])}>Add Item</Btn>
  </div><div className="mt-4 flex justify-between rounded-xl p-3 bg-[var(--app-surface-muted)]"><span className="text-sm">Estimated Total</span><strong>{peso(rows.reduce((sum, row) => sum + Number(row.quantityOrdered || 0) * Number(row.unitCost || 0), 0))}</strong></div>{error && <p className="text-sm mt-3 text-[var(--app-danger)]">{error}</p>}<div className="mt-5 flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn variant="outline" disabled={saving} onClick={() => void save("DRAFT")}>Save Draft</Btn><Btn icon={Send} disabled={saving} onClick={() => void save("ORDERED")}>{saving ? "Saving…" : "Create Order"}</Btn></div>{ingredientTarget!==null&&<IngredientEditorModal categories={Array.from(new Set(inventory.map((item)=>item.category))).sort()} onClose={()=>setIngredientTarget(null)} onCreated={(item)=>{onInventoryCreated(item);update(ingredientTarget,{inventoryItemId:item.id,unitCost:String(item.unitCost)});setIngredientTarget(null);}}/>}</ModalShell>;
}

function OrderDetail({ order, role, onClose, onOrder, onCancel, onReceive }: { order: PurchaseOrder; role: Role; onClose: () => void; onOrder: () => void; onCancel: () => void; onReceive: () => void }) {
  return <ModalShell title={order.poNo} onClose={onClose}>
    <div className="grid sm:grid-cols-4 gap-3 rounded-xl p-4 bg-[var(--app-surface-muted)]">
      {[["Branch", order.branchName], ["Supplier", order.supplierName], ["Created By", order.createdByName], ["Status", prettyStatus(order.status)]].map(([label, value]) => <div key={label}><p className="text-xs text-[var(--app-text-muted)]">{label}</p><p className="text-sm font-semibold mt-1">{value}</p></div>)}
    </div>
    <div className="mt-4 rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
      <TableWrapper minWidth={580}>
        <THead cols={["SKU", "Ingredient", "Ordered", "Received", "Unit Cost", "Total"]}/>
        <tbody>
          {order.items.map((item) => <TR key={item.id}>
            <TD mono muted>{item.sku}</TD>
            <TD><span className="font-medium">{item.name}</span></TD>
            <TD right>{item.quantityOrdered} {item.unit}</TD>
            <TD right>{item.quantityReceived} {item.unit}</TD>
            <TD right muted>{peso(item.unitCost)}</TD>
            <TD right bold>{peso(item.quantityOrdered * item.unitCost)}</TD>
          </TR>)}
        </tbody>
      </TableWrapper>
    </div>
    <div className="mt-4 flex justify-between items-center px-1">
      <span className="font-semibold text-sm">Total Amount</span>
      <strong className="text-base text-[var(--app-primary)]">{peso(order.totalAmount)}</strong>
    </div>
    {order.notes && <p className="mt-3 text-xs text-[var(--app-text-muted)] bg-[var(--app-surface-muted)] p-3 rounded-xl">{order.notes}</p>}
    <div className="mt-5 flex justify-end gap-2">
      <Btn variant="outline" onClick={onClose}>Close</Btn>
      {role === "manager" && order.status === "DRAFT" && <Btn icon={Send} onClick={onOrder}>Mark Ordered</Btn>}
      {role === "manager" && (order.status === "ORDERED" || order.status === "PARTIALLY_RECEIVED") && <Btn icon={PackageCheck} onClick={onReceive}>Receive Items</Btn>}
      {role === "manager" && ["DRAFT", "ORDERED"].includes(order.status) && <Btn variant="danger" onClick={onCancel}>Cancel</Btn>}
    </div>
  </ModalShell>;
}

function ReceiveOrder({ order, onClose, onReceived }: { order: PurchaseOrder; onClose: () => void; onReceived: () => void }) {
  const [date, setDate] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const save = async () => { const items = order.items.map((item) => ({ purchaseOrderItemId: item.id, quantityReceived: Number(quantities[item.id] ?? 0) })).filter((item) => item.quantityReceived > 0); if (!date) { setError("Select the received date."); return; } if (!items.length) { setError("Enter at least one received quantity."); return; } setSaving(true); setError(""); try { await operationsService.receivePurchaseOrder(order.id, date, items); toast.success("Received stock added to inventory"); onReceived(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to receive purchase order."); } finally { setSaving(false); } };
  return <ModalShell title={`Receive ${order.poNo}`} onClose={onClose}><div className="max-w-xs"><CalendarDateField label="Received Date" value={date} onChange={setDate}/></div><div className="mt-4 space-y-3">{order.items.map((item) => <label key={item.id} className="grid grid-cols-1 sm:grid-cols-[1fr_170px] gap-2 sm:gap-3 sm:items-center text-sm"><span>{item.name} <small className="text-[var(--app-text-muted)]">({item.quantityReceived}/{item.quantityOrdered} {item.unit} received)</small></span><input className="field" type="number" min="0.001" max={item.quantityOrdered - item.quantityReceived} step="any" value={quantities[item.id] ?? ""} placeholder={`Max ${item.quantityOrdered - item.quantityReceived}`} onChange={(e) => setQuantities((current) => ({ ...current, [item.id]: e.target.value }))}/></label>)}</div>{error && <p className="text-sm mt-3 text-[var(--app-danger)]">{error}</p>}<div className="mt-5 flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn icon={PackageCheck} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Confirm Receipt"}</Btn></div></ModalShell>;
}
