import { useState } from "react";
import { Power, X } from "lucide-react";
import { Btn, C } from "./ModuleUi";

export function TwoStepDeactivationDialog({message,reasons,busy,onCancel,onConfirm}:{message:string;reasons:readonly string[];busy:boolean;onCancel:()=>void;onConfirm:(reason:string)=>void}) {
  const [step,setStep]=useState<1|2>(1);
  const [selected,setSelected]=useState("");
  const [other,setOther]=useState("");
  const finalReason=selected==="Other."?`Other: ${other.trim()}`:selected;
  const valid=Boolean(selected)&&(selected!=="Other."||other.trim().length>=10);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onCancel();}}>
    <div className="w-full max-w-lg rounded-2xl border bg-[var(--app-surface)] p-6 shadow-2xl" style={{borderColor:C.border}}>
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Deactivate</h2><p className="mt-2 text-sm text-[var(--app-text-muted)]">{message}</p></div><button aria-label="Cancel deactivation" disabled={busy} onClick={onCancel} className="rounded-lg p-2 hover:bg-[var(--app-surface-muted)]"><X size={18}/></button></div>
      {step===1?<div className="mt-6 flex justify-end gap-2"><Btn variant="outline" onClick={onCancel}>Cancel</Btn><Btn variant="danger" onClick={()=>setStep(2)}>Proceed</Btn></div>:<>
        <p className="mt-5 text-sm font-semibold">Select a reason</p><div className="mt-3 grid gap-2">{reasons.map(reason=><button key={reason} type="button" aria-pressed={selected===reason} onClick={()=>setSelected(reason)} className="rounded-xl border px-3 py-2.5 text-left text-sm font-medium" style={{borderColor:selected===reason?C.maroon:C.border,background:selected===reason?C.softMaroonBg:C.surface,color:selected===reason?C.maroon:C.primary}}>{reason}</button>)}</div>
        {selected==="Other."&&<label className="mt-3 block text-sm font-medium">Explanation<textarea autoFocus value={other} onChange={event=>setOther(event.target.value)} className="field mt-1.5 min-h-24" maxLength={1000}/><span className="mt-1 block text-xs text-[var(--app-text-muted)]">At least 10 characters are required.</span></label>}
        <div className="mt-6 flex justify-end gap-2"><Btn variant="outline" disabled={busy} onClick={onCancel}>Cancel</Btn><Btn variant="danger" icon={Power} disabled={busy||!valid} onClick={()=>onConfirm(finalReason)}>{busy?"Deactivating…":"Deactivate"}</Btn></div>
      </>}
    </div>
  </div>;
}
