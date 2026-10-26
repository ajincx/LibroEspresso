import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({
  posSources:vi.fn(),posFormatSetupRequests:vi.fn(),posMappings:vi.fn(),configure:vi.fn(),reject:vi.fn(),
  menuProducts:vi.fn(),branches:vi.fn(),
}));

vi.mock("../../services/inventoryWorkflow.service",()=>({inventoryWorkflowService:{
  posSources:mocks.posSources,posFormatSetupRequests:mocks.posFormatSetupRequests,posMappings:mocks.posMappings,
  configurePosFormatRequest:mocks.configure,rejectPosFormatRequest:mocks.reject,
}}));
vi.mock("../../services/masterData.service",()=>({masterDataService:{menuProducts:mocks.menuProducts,branches:mocks.branches}}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock("../../components/ModuleUi",async()=>{
  const actual=await vi.importActual<typeof import("../../components/ModuleUi")>("../../components/ModuleUi");
  return {...actual,Select:({value,onChange,options,"aria-label":ariaLabel}:{value:string;onChange:(value:string)=>void;options:Array<{value:string;label:string}>;"aria-label"?:string})=>createElement("select",{value,"aria-label":ariaLabel,onChange:(event:{target:{value:string}})=>onChange(event.target.value)},options.map(option=>createElement("option",{key:option.value,value:option.value},option.label)))};
});

import type { PosFormatSetupRequest, PosSource } from "../../types/inventoryWorkflow";
import { PosMappingSetup } from "./CogsSalesModule";

const headers=["Product","Quantity","OR No","Date","Status","Unit Price","Extra"];
const request=(id:string,filename:string,extraHeader:string):PosFormatSetupRequest=>({
  id,branchId:`branch-${id}`,branchName:id==="request-1"?"Gulod / Main Branch":"Lipa Branch",posSourceId:`source-${id}`,
  posSourceName:`POS ${id}`,sourceFilename:filename,worksheet:"Sales",headerRow:2,headers:[...headers.slice(0,-1),extraHeader],
  status:"PENDING",validationIssues:null,requestedBy:`manager-${id}`,requestedByName:id==="request-1"?"Ana Reyes":"Ben Cruz",
  requestedAt:"2026-10-24T01:30:00.000Z",configuredBy:null,configuredAt:null,completedAt:null,rejectionReason:null,
  rejectedBy:null,rejectedByName:null,rejectedAt:null,posImportId:null,
});
const source=(id:string):PosSource=>({
  id:`source-${id}`,branchId:`branch-${id}`,branchName:id==="request-1"?"Gulod / Main Branch":"Lipa Branch",sourceCode:`POS-${id}`,
  displayName:`POS ${id}`,supportedFormat:"CUSTOM_TABULAR_XLSX",status:"INACTIVE",formatVerifiedBy:null,formatVerifiedByName:null,
  formatVerifiedAt:null,fieldMapping:null,hasImports:false,hasSales:false,hasActiveMappings:false,hasPendingMappings:false,
});
const requests=[request("request-1","DeviceTrack.xlsx","Extra"),request("request-2","LipaSales.xlsx","Extra Two")];
const sources=[source("request-1"),source("request-2")];

const nodeText=(node:ReactTestInstance):string=>node.children.map((child:ReactNode|ReactTestInstance)=>typeof child==="string"?child:typeof child==="number"?String(child):nodeText(child as ReactTestInstance)).join("");
const button=(root:ReactTestInstance,label:string,index=0)=>{
  const matches=root.findAllByType("button").filter(candidate=>nodeText(candidate).trim()===label);
  if(!matches[index])throw new Error(`Button ${label} was not rendered`);
  return matches[index];
};
const select=(root:ReactTestInstance,label:string)=>{
  const match=root.findAllByType("select").find(candidate=>candidate.props["aria-label"]===label);
  if(!match)throw new Error(`Select ${label} was not rendered`);
  return match;
};

describe("Pending POS format request workflow",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.posSources.mockResolvedValue(sources);
    mocks.posFormatSetupRequests.mockResolvedValue(requests);
    mocks.posMappings.mockResolvedValue([]);
    mocks.menuProducts.mockResolvedValue([]);
    mocks.branches.mockResolvedValue([]);
    mocks.configure.mockResolvedValue({requestId:"request-1",status:"COMPLETED",imported:true});
    mocks.reject.mockResolvedValue({requestId:"request-2",status:"REJECTED"});
  });

  it("opens the matching request, preserves isolated drafts, and configures only the selected request",async()=>{
    let renderer:ReactTestRenderer;
    await act(async()=>{renderer=create(<PosMappingSetup/>);});
    const root=renderer!.root;
    await act(async()=>button(root,"Open POS Setup").props.onClick());
    await act(async()=>undefined);

    expect(nodeText(root)).toContain("Gulod / Main Branch");
    expect(nodeText(root)).toContain("Ana Reyes");
    expect(nodeText(root)).toContain("DeviceTrack.xlsx");
    expect(nodeText(root)).toContain("Requested:");
    expect(root.findAllByType("button").filter(candidate=>nodeText(candidate).includes("View Request"))).toHaveLength(2);

    await act(async()=>button(root,"View Request",0).props.onClick());
    expect(nodeText(root)).toContain("Detected 7 spreadsheet columns");
    expect(nodeText(root)).toContain("Column Mapping");
    expect(select(root,"Map source column Extra").props.value).toBe("");
    await act(async()=>select(root,"Map source column Extra").props.onChange({target:{value:"salesAmount"}}));
    await act(async()=>button(root,"Back to Requests").props.onClick());

    await act(async()=>button(root,"View Request",1).props.onClick());
    expect(select(root,"Map source column Extra Two").props.value).toBe("");
    await act(async()=>button(root,"Back to Requests").props.onClick());
    await act(async()=>button(root,"View Request",0).props.onClick());
    expect(select(root,"Map source column Extra").props.value).toBe("salesAmount");

    await act(async()=>button(root,"Save Format & Continue Import").props.onClick());
    expect(mocks.configure).toHaveBeenCalledWith("request-1",requests[0]!.headers,expect.objectContaining({salesAmount:"Extra"}));
    expect(nodeText(root)).toContain("Pending Format Requests");
  });

  it("keeps rejection attached to the selected request and returns to the request list",async()=>{
    let renderer:ReactTestRenderer;
    await act(async()=>{renderer=create(<PosMappingSetup/>);});
    const root=renderer!.root;
    await act(async()=>button(root,"Open POS Setup").props.onClick());
    await act(async()=>undefined);
    await act(async()=>button(root,"View Request",1).props.onClick());
    await act(async()=>button(root,"Reject Request").props.onClick());
    const textarea=root.findByType("textarea");
    await act(async()=>textarea.props.onChange({target:{value:"Incorrect export layout."}}));
    await act(async()=>button(root,"Reject Request",1).props.onClick());
    expect(mocks.reject).toHaveBeenCalledWith("request-2","Incorrect export layout.");
    expect(nodeText(root)).toContain("Pending Format Requests");
  });
});
