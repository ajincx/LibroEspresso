import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({createPurchaseOrder:vi.fn()}));
vi.mock("../../contexts/AuthContext",()=>({useOptionalAuth:()=>({user:{id:"manager-1",branchId:"branch-1",role:"BRANCH_MANAGER"}})}));
vi.mock("../../services/operations.service",()=>({operationsService:{createPurchaseOrder:mocks.createPurchaseOrder}}));
vi.mock("sonner",()=>({toast:{error:vi.fn(),success:vi.fn()}}));

import { CreatePurchaseOrder } from "./PurchaseOrdersPage";

const values=new Map<string,string>();
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});

describe("Purchase order temporary draft autosave",()=>{
  beforeEach(()=>{values.clear();vi.clearAllMocks();});
  it("autosaves meaningful incomplete form data without creating an official PO",async()=>{
    vi.useFakeTimers();
    let renderer:ReactTestRenderer;
    await act(async()=>{renderer=create(<CreatePurchaseOrder inventory={[{id:"item-1",sku:"ING-1",name:"Beans",category:"Coffee",unit:"g",unitCost:1,reorderLevel:10,status:"ACTIVE",itemScope:"GLOBAL",originBranchId:null}]} suppliers={[]} initialItem={{ingredientId:"item-1",quantity:"2"}} onInventoryCreated={vi.fn()} onClose={vi.fn()} onGoToInventoryCount={vi.fn()} onCreated={vi.fn()}/>);});
    await act(async()=>{vi.advanceTimersByTime(650);});
    vi.useRealTimers();
    expect(mocks.createPurchaseOrder).not.toHaveBeenCalled();
    expect([...values.values()].some((value)=>value.includes('"inventoryItemId":"item-1"'))).toBe(true);
    renderer!.unmount();
  });
});
