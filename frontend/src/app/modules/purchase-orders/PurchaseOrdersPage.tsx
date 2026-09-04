import React, { lazy, Suspense, useEffect, useState } from "react";
import { Sparkles, Search, X, Plus, Eye, Check, XCircle, Clock, Coffee, CheckCircle, Inbox } from "lucide-react";
import { C, StatusChip, Card, SectionHeader, Btn, SearchInput, Select, THead, TR, TD, Pagination, EmptyState } from "../../components/ModuleUi";
import { purchaseOrders } from "../demoData";
import { toast } from "sonner";
import type { Page, Role } from "../../types/navigation";

export function PurchaseOrders({ role }: { role: Role }) {
  const [tab, setTab] = useState(role === "owner" ? "pending" : "all");
  const [selectedPO, setSelectedPO] = useState<typeof purchaseOrders[0] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionModal, setActionModal] = useState<{ po: typeof purchaseOrders[0]; type: "approve" | "reject" } | null>(null);

  const tabs = role === "owner"
    ? ["pending", "approved", "rejected", "completed"]
    : ["all", "draft", "pending", "approved", "rejected", "completed"];

  const filtered = tab === "all" ? purchaseOrders : purchaseOrders.filter(p => p.status === tab);
  const pendingCount = purchaseOrders.filter(p => p.status === "pending").length;

  return (
    <div className="p-6 space-y-5">
      <SectionHeader
        title={role === "owner" ? "Purchase Order Approvals" : "Purchase Requests"}
        sub={role === "owner" ? "Review and approve branch purchase requests" : "Lipa Branch"}
        actions={
          <>
            {role === "manager" && <Btn variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>Create Purchase Request</Btn>}
          </>
        } />

      {role === "owner" && pendingCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ borderColor: C.amber + "80", background: C.amberBg }}>
          <Clock size={14} style={{ color: C.amber }} />
          <p className="text-sm font-medium" style={{ color: "#7A4A00" }}>
            <strong>{pendingCount} purchase requests</strong> are awaiting your approval.
          </p>
          <button className="ml-auto text-sm font-bold" style={{ color: C.amber }}>Review All</button>
        </div>
      )}

      <div className="flex gap-1 border-b" style={{ borderColor: C.border }}>
        {tabs.map(t => {
          const cnt = t === "all" ? purchaseOrders.length : purchaseOrders.filter(p => p.status === t).length;
          return (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2.5 text-sm font-medium capitalize border-b-2 flex items-center gap-1.5 transition-colors"
              style={{ borderColor: tab === t ? C.maroon : "transparent", color: tab === t ? C.maroon : C.secondary }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {cnt > 0 && (
                <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                  style={{ background: t === "pending" ? C.amberBg : C.grayBg, color: t === "pending" ? C.amber : C.secondary }}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title="No purchase requests"
            body="Purchase requests submitted by branch managers will appear here."
            action={role === "manager" ? "Create Purchase Request" : undefined}
            onAction={() => setShowCreate(true)} />
        </Card>
      ) : (
        <Card padding={false}>
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <SearchInput placeholder="Search PO number…" />
              {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} />}
              <Select options={["All Suppliers", "Metro Dairy Supply", "PH Coffee Traders", "Artisan Bakers PH"]} />
            </div>
          </div>
          <div className="overflow-x-auto">
              <table className="data-table w-full">
              <THead cols={role === "owner"
                ? ["PO Number", "Branch", "Supplier", "Requested By", "Date", "Amount", "AI Match", "Status", "Actions"]
                : ["PO Number", "Supplier", "Date", "Items", "Total", "Status", "Actions"]} />
              <tbody>
                {filtered.map(po => (
                  <TR key={po.id} onClick={() => setSelectedPO(po)}>
                    <TD><span className="font-mono text-xs font-bold" style={{ color: C.maroon }}>{po.id}</span></TD>
                    {role === "owner" && <TD muted>{po.branch}</TD>}
                    <TD muted>{po.supplier}</TD>
                    {role === "owner" && <TD muted>{po.requestedBy}</TD>}
                    <TD muted>{po.date}</TD>
                    {role === "manager" && <TD right muted>{po.items} items</TD>}
                    <TD right className="font-semibold">₱{po.total.toLocaleString()}</TD>
                    {role === "owner" && (
                      <TD>
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: po.aiMatch ? C.green : C.muted }}>
                          {po.aiMatch ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {po.aiMatch ? "Aligned" : "Differs"}
                        </span>
                      </TD>
                    )}
                    <TD><StatusChip status={po.status} /></TD>
                    <TD>
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <button className="p-1.5 rounded-md" style={{ color: C.secondary }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          onClick={() => setSelectedPO(po)}>
                          <Eye size={13} />
                        </button>
                        {role === "owner" && po.status === "pending" && (
                          <>
                            <button className="px-2 py-1 rounded-lg text-xs font-bold"
                              style={{ background: C.greenBg, color: C.green }}
                              onClick={() => setActionModal({ po, type: "approve" })}>
                              Approve
                            </button>
                            <button className="px-2 py-1 rounded-lg text-xs font-bold"
                              style={{ background: C.redBg, color: C.red }}
                              onClick={() => setActionModal({ po, type: "reject" })}>
                              Reject
                            </button>
                          </>
                        )}
                        {role === "manager" && po.status === "draft" && (
                          <button className="px-2 py-1 rounded-lg text-xs font-bold text-white"
                            style={{ background: C.maroon }}>
                            Submit
                          </button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={filtered.length} page={1} perPage={5} />
        </Card>
      )}

      {/* PO Detail Drawer */}
      {selectedPO && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSelectedPO(null)} />
          <div className="fixed right-0 top-0 h-full z-50 bg-white border-l flex flex-col"
            style={{ width: 440, borderColor: C.border, boxShadow: "-4px 0 24px rgba(0,0,0,0.08)" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.border }}>
              <div>
                <h3 className="font-bold" style={{ color: C.primary }}>{selectedPO.id}</h3>
                <p className="text-xs mt-0.5" style={{ color: C.secondary }}>{selectedPO.supplier} · {selectedPO.date}</p>
              </div>
              <button onClick={() => setSelectedPO(null)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: C.secondary, background: C.grayBg }}>
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-center justify-between">
                <StatusChip status={selectedPO.status} />
                <span className="text-xs" style={{ color: C.muted }}>{selectedPO.date}</span>
              </div>
              <div className="grid grid-cols-2 gap-y-3 text-sm p-4 rounded-xl" style={{ background: C.mainBg }}>
                {[["Branch", selectedPO.branch], ["Requested By", selectedPO.requestedBy], ["Supplier", selectedPO.supplier], ["Items", `${selectedPO.items} items`]].map(([l, v]) => (
                  <div key={l}>
                    <span style={{ color: C.secondary }}>{l}: </span>
                    <span className="font-semibold" style={{ color: C.primary }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="border rounded-xl overflow-hidden" style={{ borderColor: C.border }}>
                <div className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider" style={{ background: "#FAFBFC", color: C.secondary }}>
                  Request Items
                </div>
                {[
                  { name: "Whole Milk", sku: "RM-001", qty: 24, unit: "L", cost: 140 },
                  { name: "Arabica Beans", sku: "RM-002", qty: 10, unit: "kg", cost: 760 },
                  { name: "White Sugar", sku: "RM-008", qty: 20, unit: "kg", cost: 90 },
                ].map(item => (
                  <div key={item.sku} className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: C.primary }}>{item.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.muted }}>{item.sku} · {item.qty} {item.unit} @ ₱{item.cost}</p>
                    </div>
                    <span className="text-sm font-bold" style={{ color: C.primary }}>₱{(item.qty * item.cost).toLocaleString()}</span>
                  </div>
                ))}
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color: C.primary }}>Total</span>
                  <span className="text-base font-bold" style={{ color: C.maroon }}>₱{selectedPO.total.toLocaleString()}</span>
                </div>
              </div>
              {selectedPO.aiMatch && (
                <div className="p-3 rounded-xl border flex items-start gap-2.5" style={{ borderColor: "#C3E8D4", background: C.greenBg }}>
                  <Sparkles size={13} style={{ color: C.green, flexShrink: 0, marginTop: 1 }} />
                  <p className="text-xs leading-relaxed" style={{ color: "#1A6B3C" }}>
                    AI recommendation aligns with requested quantities based on current stock and projected demand at {selectedPO.branch}.
                  </p>
                </div>
              )}
            </div>
            {role === "owner" && selectedPO.status === "pending" && (
              <div className="border-t p-4 flex gap-3" style={{ borderColor: C.border }}>
                <button className="flex-1 py-2.5 rounded-xl text-sm font-bold border flex items-center justify-center gap-2"
                  style={{ borderColor: C.red, color: C.red, background: C.redBg }}
                  onClick={() => setActionModal({ po: selectedPO, type: "reject" })}>
                  <XCircle size={14} /> Reject
                </button>
                <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                  style={{ background: C.green }}
                  onClick={() => setActionModal({ po: selectedPO, type: "approve" })}>
                  <Check size={14} /> Approve
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Approve/Reject Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: `1px solid ${C.border}` }}>
            <h3 className="font-bold text-lg mb-2" style={{ color: C.primary }}>
              {actionModal.type === "approve" ? "Approve Purchase Request?" : "Reject Purchase Request?"}
            </h3>
            <p className="text-sm mb-4" style={{ color: C.secondary }}>
              {actionModal.po.id} · {actionModal.po.branch} · ₱{actionModal.po.total.toLocaleString()}
            </p>
            {actionModal.type === "reject" && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Reason for rejection *</label>
                <textarea rows={3} placeholder="Provide a reason for rejecting this request…"
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none resize-none"
                  style={{ borderColor: C.border, color: C.primary }} />
              </div>
            )}
            <div className="flex gap-3">
              <Btn variant="outline" onClick={() => setActionModal(null)}>Cancel</Btn>
              <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: actionModal.type === "approve" ? C.green : C.red }}
                onClick={() => {
                  setActionModal(null); setSelectedPO(null);
                  toast.success(actionModal.type === "approve" ? `${actionModal.po.id} approved successfully` : `${actionModal.po.id} rejected`);
                }}>
                {actionModal.type === "approve" ? "Approve Request" : "Reject Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create PO Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6" style={{ border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg" style={{ color: C.primary }}>Create Purchase Request</h3>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: C.secondary, background: C.grayBg }}>
                <X size={15} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Supplier</label>
                <select className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }}>
                  <option>Metro Dairy Supply</option>
                  <option>PH Coffee Traders</option>
                  <option>Artisan Bakers PH</option>
                  <option>Sysco Philippines</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Requested Delivery Date</label>
                <input type="date" defaultValue="2026-08-29" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }} />
              </div>
            </div>
            <div className="border rounded-xl overflow-hidden mb-4" style={{ borderColor: C.border }}>
              <div className="grid text-xs font-bold uppercase tracking-wider px-4 py-2.5" style={{ color: C.secondary, gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", background: "#FAFBFC" }}>
                <span>Ingredient</span><span className="text-right">On Hand</span><span className="text-right">AI Qty</span><span className="text-right">Requested</span><span className="text-right">Est. Total</span>
              </div>
              {[
                { name: "Whole Milk", on: "45 L", ai: 24, unit: "L", cost: 140 },
                { name: "Arabica Beans", on: "12 kg", ai: 10, unit: "kg", cost: 760 },
                { name: "White Sugar", on: "8 kg", ai: 20, unit: "kg", cost: 90 },
              ].map(item => (
                <div key={item.name} className="grid items-center px-4 py-3 border-b" style={{ borderColor: C.border, gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}>
                  <span className="text-sm font-semibold" style={{ color: C.primary }}>{item.name}</span>
                  <span className="text-sm text-right" style={{ color: C.red }}>{item.on}</span>
                  <span className="text-sm text-right" style={{ color: C.green }}>{item.ai} {item.unit}</span>
                  <div className="flex justify-end">
                    <input type="number" defaultValue={item.ai} className="w-16 px-2 py-1 text-sm rounded-lg border text-right outline-none" style={{ borderColor: C.border, color: C.primary }} />
                  </div>
                  <span className="text-sm text-right font-semibold" style={{ color: C.primary }}>₱{(item.ai * item.cost).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-4 py-3 rounded-xl mb-4" style={{ background: C.mainBg }}>
              <span className="text-sm font-bold" style={{ color: C.primary }}>Estimated Total</span>
              <span className="text-lg font-bold" style={{ color: C.maroon }}>₱28,400</span>
            </div>
            <p className="text-xs mb-4 flex items-center gap-1.5" style={{ color: C.muted }}>
              <Sparkles size={11} />
              AI quantities are suggestions based on stock levels and demand. Adjust as needed before submitting.
            </p>
            <div className="flex gap-3">
              <Btn variant="outline" onClick={() => setShowCreate(false)}>Cancel</Btn>
              <Btn variant="outline" onClick={() => setShowCreate(false)}>Save Draft</Btn>
              <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.maroon }}
                onClick={() => { setShowCreate(false); toast.success("Purchase request submitted for approval"); }}>
                Submit for Approval
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
