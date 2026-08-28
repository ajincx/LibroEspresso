import { useEffect, useState } from "react";
import { Package, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { masterDataService } from "../../services/masterData.service";
import type { InventoryItem } from "../../types/masterData";

const emptyForm = { sku: "", name: "", category: "", unit: "", unitCost: 0, reorderLevel: 0, status: "ACTIVE" as const };

export function MasterDataPage() {
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

  const create = async () => {
    if (!form.sku.trim() || !form.name.trim() || !form.category.trim() || !form.unit.trim()) {
      toast.error("Complete all required inventory fields"); return;
    }
    setSaving(true);
    try {
      await masterDataService.createInventoryItem(form);
      setForm(emptyForm); setOpen(false); toast.success("Inventory item created"); await load();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to create inventory item"); }
    finally { setSaving(false); }
  };

  return <div className="p-6 space-y-5">
    <div className="flex items-start justify-between gap-4">
      <div><h1 className="text-xl font-bold">Inventory Master Data</h1><p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>Maintain the shared ingredients used by Inventory and Menu standard recipes.</p></div>
      <div className="flex gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold" style={{ borderColor: "var(--app-border)" }}><RefreshCw size={14} />Refresh</button><button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--app-primary)" }}><Plus size={15} />Add Inventory Item</button></div>
    </div>
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-primary-faint)", color: "var(--app-text-muted)" }}><Package size={15} style={{ color: "var(--app-primary)" }} /><span className="text-sm">Unit cost and unit of measure from this list drive recipe cost and unit validation.</span></div>
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      {loading ? <div className="p-14 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>Loading inventory items…</div> : error ? <div className="p-14 text-center"><p className="text-sm mb-3" style={{ color: "var(--app-danger)" }}>{error}</p><button onClick={() => void load()} style={{ color: "var(--app-primary)" }}>Retry</button></div> : inventory.length === 0 ? <div className="p-14 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No inventory items found.</div> : <div className="overflow-x-auto"><table className="data-table w-full text-sm"><thead style={{ background: "var(--app-bg)" }}><tr>{["SKU","Ingredient","Category","Unit","Unit Cost","Reorder Level","Status"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs" style={{ color: "var(--app-text-muted)" }}>{heading}</th>)}</tr></thead><tbody>{inventory.map((item) => <tr key={item.id} className="border-t" style={{ borderColor: "var(--app-border)" }}><td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--app-primary)" }}>{item.sku}</td><td className="px-4 py-3 font-semibold">{item.name}</td><td className="px-4 py-3">{item.category}</td><td className="px-4 py-3">{item.unit}</td><td className="px-4 py-3">₱{item.unitCost.toFixed(4)}</td><td className="px-4 py-3">{item.reorderLevel}</td><td className="px-4 py-3">{item.status === "ACTIVE" ? "Active" : "Inactive"}</td></tr>)}</tbody></table></div>}
    </div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)" }}><div className="w-full max-w-xl rounded-2xl border p-6" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><div className="flex justify-between mb-5"><div><h2 className="text-lg font-bold">Add Inventory Item</h2><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>This ingredient becomes available in Menu standard recipes.</p></div><button onClick={() => setOpen(false)}><X size={18} /></button></div><div className="grid grid-cols-2 gap-3"><Field label="SKU *" value={form.sku} onChange={(value) => setForm((current) => ({ ...current, sku: value.toUpperCase() }))} /><Field label="Ingredient Name *" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} /><Field label="Category *" value={form.category} onChange={(value) => setForm((current) => ({ ...current, category: value }))} /><Field label="Unit *" value={form.unit} onChange={(value) => setForm((current) => ({ ...current, unit: value }))} /><Field label="Unit Cost *" type="number" value={form.unitCost} onChange={(value) => setForm((current) => ({ ...current, unitCost: Number(value) }))} /><Field label="Reorder Level" type="number" value={form.reorderLevel} onChange={(value) => setForm((current) => ({ ...current, reorderLevel: Number(value) }))} /></div><div className="flex gap-3 mt-6"><button onClick={() => setOpen(false)} className="flex-1 py-2.5 rounded-xl border" style={{ borderColor: "var(--app-border)" }}>Cancel</button><button disabled={saving} onClick={() => void create()} className="flex-1 py-2.5 rounded-xl text-white font-semibold disabled:opacity-50" style={{ background: "var(--app-primary)" }}>{saving ? "Creating…" : "Create Item"}</button></div></div></div>}
  </div>;
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string | number; type?: string; onChange: (value: string) => void }) {
  return <label className="text-sm font-medium">{label}<input type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)", color: "var(--app-text)" }} /></label>;
}
