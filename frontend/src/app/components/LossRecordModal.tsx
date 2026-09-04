import React, { useState } from "react";
import { X } from "lucide-react";
import { Btn, C } from "./ModuleUi";

export function LossRecordModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [classification, setClassification] = useState<"Spoilage" | "Wastage">("Spoilage");

  const reasons = {
    Spoilage: ["Expired", "Contaminated", "Damaged", "Temperature issue", "Quality deterioration", "Other"],
    Wastage: ["Overproduction", "Preparation error", "Spillage", "Improper handling", "Other"],
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-lg" style={{ color: C.primary }}>Record Inventory Loss</h3>
            <p className="text-xs mt-0.5" style={{ color: C.secondary }}>Lipa Branch · August 26, 2026</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: C.secondary, background: C.grayBg }}>
            <X size={15} />
          </button>
        </div>

        <div className="flex rounded-xl border overflow-hidden mb-5" style={{ borderColor: C.border }}>
          {(["Spoilage", "Wastage"] as const).map(c => (
            <button key={c} onClick={() => setClassification(c)}
              className="flex-1 py-2.5 text-sm font-semibold transition-colors"
              style={{ background: classification === c ? C.maroon : C.surface, color: classification === c ? "#fff" : C.secondary }}>
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {[
            { label: "Date", type: "date", def: "2026-08-26" },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>{f.label}</label>
              <input type={f.type} defaultValue={f.def}
                className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
                style={{ borderColor: C.border, color: C.primary }} />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Item / SKU</label>
            <select className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ borderColor: C.border, color: C.primary }}>
              <option>Select ingredient…</option>
              <option>Whole Milk (RM-001)</option>
              <option>Arabica Beans (RM-002)</option>
              <option>Croissants (RM-004)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Quantity</label>
            <input type="number" placeholder="0.00" className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ borderColor: C.border, color: C.primary }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Unit</label>
            <select className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ borderColor: C.border, color: C.primary }}>
              <option>L (liters)</option>
              <option>kg (kilograms)</option>
              <option>pcs (pieces)</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Reason</label>
            <select className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ borderColor: C.border, color: C.primary }}>
              <option>Select reason…</option>
              {reasons[classification].map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Notes (optional)</label>
            <textarea rows={2} placeholder="Additional context…"
              className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none"
              style={{ borderColor: C.border, color: C.primary }} />
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl mb-5" style={{ background: C.mainBg }}>
          <span className="text-sm font-medium" style={{ color: C.secondary }}>Estimated Loss Value</span>
          <span className="text-sm font-bold" style={{ color: C.primary }}>₱0.00 (calculated on save)</span>
        </div>

        <div className="flex gap-3">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.maroon }} onClick={onSave}>
            Record Loss
          </button>
        </div>
      </div>
    </div>
  );
}
