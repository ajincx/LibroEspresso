import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({createIncident:vi.fn()}));
vi.mock("../../contexts/AuthContext",()=>({useOptionalAuth:()=>({user:{id:"staff-1",branchId:"branch-1",role:"STAFF"}})}));
vi.mock("../../services/operations.service",()=>({operationsService:{createIncident:mocks.createIncident}}));
vi.mock("sonner",()=>({toast:{error:vi.fn(),success:vi.fn()}}));

import { StaffIncidentModal } from "./StaffIncidentModal";

const values=new Map<string,string>();
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});

describe("Staff incident temporary drafts",()=>{
  beforeEach(()=>{values.clear();vi.clearAllMocks();});

  it("autosaves safe incomplete text without attachments or an incident API call",async()=>{
    let renderer:ReactTestRenderer;
    await act(async()=>{renderer=create(<StaffIncidentModal options={[]} products={[]} onClose={vi.fn()} onSaved={vi.fn()}/>);});
    const root=renderer!.root;
    const description=root.findAllByType("textarea").find((node)=>String(node.props.placeholder).includes("Describe the incident"))!;
    vi.useFakeTimers();
    await act(async()=>description.props.onChange({target:{value:"Spilled milk while cleaning"}}));
    await act(async()=>{vi.advanceTimersByTime(650);});
    vi.useRealTimers();
    expect(mocks.createIncident).not.toHaveBeenCalled();
    const stored=[...values.values()].join("\n");
    expect(stored).toContain("Spilled milk while cleaning");
    expect(stored).not.toContain("photoUrl");
    renderer!.unmount();
  });

  it("uses the application exit dialog for meaningful unfinished input",async()=>{
    let renderer:ReactTestRenderer;
    await act(async()=>{renderer=create(<StaffIncidentModal options={[]} products={[]} onClose={vi.fn()} onSaved={vi.fn()}/>);});
    const root=renderer!.root;
    const description=root.findAllByType("textarea").find((node)=>String(node.props.placeholder).includes("Describe the incident"))!;
    await act(async()=>description.props.onChange({target:{value:"Incomplete incident"}}));
    const cancel=root.findAllByType("button").find((node)=>node.children.join("")==="Cancel")!;
    await act(async()=>cancel.props.onClick());
    expect(root.findAllByProps({"aria-label":"Exit Without Submitting?"})).toHaveLength(1);
    expect(root.findAllByType("button").some((node)=>node.children.join("")==="Save as Draft")).toBe(true);
    renderer!.unmount();
  });
});
