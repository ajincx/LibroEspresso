import { useState } from "react";
import { Activity, FileWarning, Users } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import type { Role } from "../../types/navigation";

export function StaffMonitoringPage({ role }: { role: Role }) {
  const { user } = useAuth();
  const tabs = role === "owner"
    ? ["Cross-Branch Attendance", "Incident Summary", "Accountability History"]
    : ["Attendance Overview", "Staff Incident Reports", "Activity History"];
  const [active, setActive] = useState(tabs[0]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Staff Monitoring</h1>
        <p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>
          {role === "owner" ? "Monitor attendance and incident accountability across all branches." : `Monitor attendance and operational incidents for ${user?.branch?.name ?? "your assigned branch"}.`}
        </p>
      </div>
      <div className="flex gap-1 p-1 rounded-xl border overflow-x-auto" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        {tabs.map((tab) => <button key={tab} onClick={() => setActive(tab)}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors"
          style={{ background: active === tab ? "var(--app-primary)" : "transparent", color: active === tab ? "#fff" : "var(--app-text-muted)" }}>{tab}</button>)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          ["Attendance Records", "Pending Staff integration", Users],
          ["Incident Reports", "Pending Staff integration", FileWarning],
          ["Verified Activities", "Pending Staff integration", Activity],
        ].map(([label, value, Icon]) => {
          const MetricIcon = Icon as typeof Users;
          return <div key={label as string} className="p-5 rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>{label as string}</p><p className="text-sm font-bold mt-2">{value as string}</p></div><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--app-primary-faint)", color: "var(--app-primary)" }}><MetricIcon size={17} /></div></div>
          </div>;
        })}
      </div>
      <div className="rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <EmptyModule icon={Users} title={active} body="Records will appear here after the restricted Staff role, attendance, and incident-reporting workflow are connected to the database." />
      </div>
      <p className="text-xs text-center" style={{ color: "var(--app-text-faint)" }}>Attendance is supporting accountability information and does not automatically assign responsibility for inventory shrinkage.</p>
    </div>
  );
}

function EmptyModule({ icon: Icon, title, body }: { icon: typeof Users; title: string; body: string }) {
  return <div className="flex flex-col items-center justify-center p-12 text-center">
    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--app-primary-faint)", color: "var(--app-primary)" }}><Icon size={20} /></div>
    <h2 className="font-semibold">{title}</h2>
    <p className="text-sm mt-1 max-w-md leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{body}</p>
  </div>;
}
