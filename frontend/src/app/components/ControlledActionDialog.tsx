import { AlertTriangle } from "lucide-react";
import { Btn } from "./ModuleUi";

export type ControlledActionValue = { reason: string; verificationPin: string };

export function ControlledActionDialog({
  title, description, confirmLabel, value, busy, onChange, onCancel, onConfirm,
}: {
  title: string; description: string; confirmLabel: string; value: ControlledActionValue; busy: boolean;
  onChange: (value: ControlledActionValue) => void; onCancel: () => void; onConfirm: () => void;
}) {
  const ready = value.reason.trim().length >= 10 && value.verificationPin.trim().length > 0;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="controlled-action-title">
    <div className="w-full max-w-lg rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-2xl">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--app-danger-bg)] text-[var(--app-danger)]"><AlertTriangle size={21}/></div>
      <h2 id="controlled-action-title" className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">{description}</p>
      <label className="mt-4 block text-sm font-medium">Required reason
        <textarea className="field mt-1.5 min-h-24" maxLength={500} value={value.reason} onChange={(event)=>onChange({...value,reason:event.target.value})} placeholder="Explain why this controlled action is necessary"/>
      </label>
      <label className="mt-4 block text-sm font-medium">Verification PIN
        <input className="field mt-1.5" type="password" inputMode="numeric" autoComplete="one-time-code" value={value.verificationPin} onChange={(event)=>onChange({...value,verificationPin:event.target.value})} placeholder="Enter verification PIN"/>
      </label>
      <p className="mt-3 text-xs text-[var(--app-text-faint)]">The server rechecks your role and dependencies. The action and reason are written to the audit trail.</p>
      <div className="mt-6 flex justify-end gap-2"><Btn variant="outline" disabled={busy} onClick={onCancel}>Cancel</Btn><Btn variant="danger" disabled={busy||!ready} onClick={onConfirm}>{busy?"Processing…":confirmLabel}</Btn></div>
    </div>
  </div>;
}
