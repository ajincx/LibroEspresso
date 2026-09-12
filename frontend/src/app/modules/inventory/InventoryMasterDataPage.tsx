import { useEffect, useMemo, useState } from "react";
import { Package, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { masterDataService } from "../../services/masterData.service";
import type { InventoryItem } from "../../types/masterData";
import { Select, TableCard, TableWrapper, THead, TR, TD, TableEmptyRow, TableLoadingRow, StatusChip, Btn } from "../../components/ModuleUi";
import { useAuth } from "../../contexts/AuthContext";
import { units } from "../../utils/units";

const emptyForm = { name: "", categoryChoice: "", otherCategory: "", unit: "", unitCost: "", reorderLevel: "", status: "ACTIVE" as const };

export function MasterDataPage() {
  const {user}=useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try { setInventory(await masterDataService.inventoryItems()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load inventory master data"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const categories=useMemo(()=>Array.from(new Set(inventory.map((item)=>item.category))).sort(),[inventory]);

  const create = async () => {
    const category=form.categoryChoice==="__OTHER__"?form.otherCategory.trim():form.categoryChoice;
    if (!form.name.trim() || !category || !form.unit.trim() || form.unitCost==="" || form.reorderLevel==="") {
      toast.error("Complete all required inventory fields"); return;
    }
    setSaving(true);
    try {
      await masterDataService.createInventoryItem({name:form.name.trim(),category,unit:form.unit,unitCost:Number(form.unitCost),reorderLevel:Number(form.reorderLevel),status:form.status});
      setForm(emptyForm); setOpen(false); toast.success("Inventory item created"); await load();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to create inventory item"); }
    finally { setSaving(false); }
  };

  return <div className="p-4 md:p-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">Inventory Master Data</h1>
        <p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>
          {user?.role==="OWNER"?"Maintain global ingredients available across branches.":"Maintain ingredients created specifically for your assigned branch."}
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Btn variant="outline" icon={RefreshCw} onClick={() => void load()}>Refresh</Btn>
        <Btn icon={Plus} onClick={() => setOpen(true)}>Add Inventory Item</Btn>
      </div>
    </div>
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-primary-faint)", color: "var(--app-text-muted)" }}>
      <Package size={15} style={{ color: "var(--app-primary)" }} />
      <span className="text-sm">Unit cost and unit of measure from this list drive recipe cost and unit validation.</span>
    </div>
    <TableCard
      title="Master Ingredient Catalog"
      subtitle="Standard ingredient units and costs used across branch recipes and purchase orders"
      badge={
        inventory.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--app-primary-faint)] text-[var(--app-primary)] border border-[var(--app-border)]">
            {inventory.length} ingredient{inventory.length === 1 ? "" : "s"}
          </span>
        ) : undefined
      }
    >
      <TableWrapper minWidth={840}>
        <THead cols={["Code", "Ingredient", "Scope", "Category", "Unit", "Unit Cost", "Reorder Level", "Status"]} />
        <tbody>
          {loading ? (
            <TableLoadingRow colSpan={8} label="Loading inventory items…" />
          ) : error ? (
            <TableEmptyRow colSpan={8} title="Unable to load inventory items" subtitle={error} />
          ) : inventory.length === 0 ? (
            <TableEmptyRow colSpan={8} icon={Package} title="No inventory items found" subtitle="Create an ingredient to establish baseline recipes and stock items." />
          ) : (
            inventory.map((item) => (
              <TR key={item.id}>
                <TD mono><span className="font-semibold text-[var(--app-primary)]">{item.sku}</span></TD>
                <TD><span className="font-semibold text-[var(--app-text)]">{item.name}</span></TD>
                <TD><span className="text-xs font-medium text-[var(--app-text-muted)]">{item.itemScope === "BRANCH" ? item.originBranchName ?? "Branch" : "All Branches"}</span></TD>
                <TD muted>{item.category}</TD>
                <TD muted>{item.unit}</TD>
                <TD right><span className="font-semibold">₱{item.unitCost.toFixed(4)}</span></TD>
                <TD right muted>{item.reorderLevel}</TD>
                <TD center><StatusChip status={item.status === "ACTIVE" ? "active" : "inactive"} /></TD>
              </TR>
            ))
          )}
        </tbody>
      </TableWrapper>
    </TableCard>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)" }}><div className="w-full max-w-xl rounded-2xl border p-6" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><div className="flex justify-between mb-5"><div><h2 className="text-lg font-bold">Add Inventory Item</h2><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>The ingredient code is generated automatically. {user?.role==="OWNER"?"This item will be available to all branches.":"This item will be available only to your branch."}</p></div><button onClick={() => setOpen(false)}><X size={18} /></button></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="Ingredient Name *" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} /><label className="text-sm font-medium">Category *<Select className="mt-1.5 w-full" value={form.categoryChoice} onChange={(value)=>setForm((current)=>({...current,categoryChoice:value,otherCategory:value==="__OTHER__"?current.otherCategory:""}))} options={[{value:"",label:"Select category…"},...categories.map((category)=>({value:category,label:category})),{value:"__OTHER__",label:"Others"}]}/></label>{form.categoryChoice==="__OTHER__"&&<Field label="Specify Category *" value={form.otherCategory} onChange={(value)=>setForm((current)=>({...current,otherCategory:value}))}/>}<label className="text-sm font-medium">Inventory Unit *<Select className="mt-1.5 w-full" value={form.unit} onChange={(value)=>setForm((current)=>({...current,unit:value}))} options={[{value:"",label:"Select unit…"},...units.map((unit)=>({value:unit,label:unit}))]}/></label><Field label="Unit Cost *" type="number" value={form.unitCost} onChange={(value) => setForm((current) => ({ ...current, unitCost: value }))} /><Field label="Reorder Level *" type="number" value={form.reorderLevel} onChange={(value) => setForm((current) => ({ ...current, reorderLevel: value }))} /></div><div className="flex gap-3 mt-6"><button onClick={() => setOpen(false)} className="flex-1 py-2.5 rounded-xl border" style={{ borderColor: "var(--app-border)" }}>Cancel</button><button disabled={saving} onClick={() => void create()} className="flex-1 py-2.5 rounded-xl text-white font-semibold disabled:opacity-50" style={{ background: "var(--app-primary)" }}>{saving ? "Creating…" : "Create Item"}</button></div></div></div>}
  </div>;
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string | number; type?: string; onChange: (value: string) => void }) {
  return <label className="text-sm font-medium">{label}<input type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)", color: "var(--app-text)" }} /></label>;
}
