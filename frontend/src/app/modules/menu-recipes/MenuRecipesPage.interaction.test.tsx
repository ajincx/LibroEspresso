import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMenuProduct: vi.fn(),
  createInventoryItem: vi.fn(),
  inventoryItems: vi.fn(),
  menuCategories: vi.fn(),
  menuProducts: vi.fn(),
  role: "OWNER",
}));
const localDraftValues=new Map<string,string>();
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>localDraftValues.get(key)??null,setItem:(key:string,value:string)=>localDraftValues.set(key,value),removeItem:(key:string)=>localDraftValues.delete(key)}});

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", role: mocks.role, branchId: mocks.role === "OWNER" ? null : "branch-1" } }),
}));

vi.mock("../../services/masterData.service", () => ({
  masterDataService: {
    createMenuProduct: mocks.createMenuProduct,
    createInventoryItem: mocks.createInventoryItem,
    inventoryItems: mocks.inventoryItems,
    menuCategories: mocks.menuCategories,
    menuProducts: mocks.menuProducts,
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("../../components/ModuleUi", async () => {
  const actual = await vi.importActual<typeof import("../../components/ModuleUi")>("../../components/ModuleUi");
  return {
    ...actual,
    Select: ({ value, onChange, options, className }: {
      value: string;
      onChange: (value: string) => void;
      options: Array<string | { value: string; label: string }>;
      className?: string;
    }) => createElement(
      "select",
      {
        className,
        value,
        "data-values": options.map((option) => typeof option === "string" ? option : option.value).join(","),
        onChange: (event: { target: { value: string } }) => onChange(event.target.value),
      },
      options.map((option) => {
        const normalized = typeof option === "string" ? { value: option, label: option } : option;
        return createElement("option", { key: normalized.value, value: normalized.value }, normalized.label);
      }),
    ),
  };
});

import { MenuRecipesPage } from "./MenuRecipesPage";

const nodeText = (node: ReactTestInstance): string => node.children.map((child: ReactNode | ReactTestInstance) =>
  typeof child === "string" ? child : typeof child === "number" ? String(child) : nodeText(child as ReactTestInstance),
).join("");

const button = (root: ReactTestInstance, label: string) => {
  const match = root.findAllByType("button").find((candidate) => nodeText(candidate).trim() === label);
  if (!match) throw new Error(`Button ${label} was not rendered`);
  return match;
};

describe("Menu & Recipe Owner inventory ingredient workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localDraftValues.clear();
    mocks.role = "OWNER";
    mocks.menuProducts.mockResolvedValue([]);
    mocks.menuCategories.mockResolvedValue([{ id: "category-1", name: "Coffee", description: "", status: "ACTIVE" }]);
    mocks.inventoryItems.mockResolvedValue([]);
    mocks.createInventoryItem.mockResolvedValue({
      id: "ingredient-1",
      sku: "ING-00001",
      name: "Oat Milk",
      category: "Dairy",
      unit: "ml",
      unitCost: 0.2,
      reorderLevel: 1000,
      status: "ACTIVE",
      itemScope: "GLOBAL",
      originBranchId: null,
    });
    mocks.createMenuProduct.mockResolvedValue(undefined);
  });

  it("opens New Inventory Ingredient, accepts valid details, and submits through the existing service", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<MenuRecipesPage />);
    });
    const root = renderer!.root;

    await act(async () => button(root, "Add Product").props.onClick());
    await act(async () => button(root, "Add Recipe").props.onClick());
    await act(async () => button(root, "New Inventory Ingredient").props.onClick());

    expect(root.findAllByType("h2").some((heading) => nodeText(heading) === "Add Inventory Ingredient")).toBe(true);

    const ingredientName = root.findAllByType("input").find((input) => input.props.placeholder === "e.g., Oat Milk");
    const numericInputs = root.findAllByType("input").filter((input) => input.props.placeholder === "0.00");
    const categorySelect = root.findAllByType("select").find((select) => String(select.props["data-values"]).includes("__OTHER__"));
    const unitSelect = root.findAllByType("select").find((select) => String(select.props["data-values"]).includes("ml"));
    expect(ingredientName).toBeDefined();
    expect(categorySelect).toBeDefined();
    expect(unitSelect).toBeDefined();

    await act(async () => {
      ingredientName!.props.onChange({ target: { value: "Oat Milk" } });
      categorySelect!.props.onChange({ target: { value: "__OTHER__" } });
      unitSelect!.props.onChange({ target: { value: "ml" } });
    });
    const otherCategory = root.findAllByType("input").find((input) => input.props.placeholder === "Enter new category");
    expect(otherCategory).toBeDefined();
    await act(async () => {
      otherCategory!.props.onChange({ target: { value: "Dairy" } });
      numericInputs.at(-2)!.props.onChange({ target: { value: "0.20" } });
      numericInputs.at(-1)!.props.onChange({ target: { value: "1000" } });
    });
    await act(async () => button(root, "Add Ingredient").props.onClick());

    expect(mocks.createInventoryItem).toHaveBeenCalledOnce();
    expect(mocks.createInventoryItem).toHaveBeenCalledWith({
      name: "Oat Milk",
      category: "Dairy",
      unit: "ml",
      unitCost: 0.2,
      reorderLevel: 1000,
      status: "ACTIVE",
    });
    expect(root.findAllByType("h2").some((heading) => nodeText(heading) === "Add Inventory Ingredient")).toBe(false);
  });

  it("does not expose the ingredient-creation entry point to Staff", async () => {
    mocks.role = "STAFF";
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<MenuRecipesPage />);
    });
    const labels = renderer!.root.findAllByType("button").map((candidate) => nodeText(candidate).trim());
    expect(labels).not.toContain("Add Product");
    expect(labels).not.toContain("New Inventory Ingredient");
  });

  it("rejects a numeric-only name, then submits a valid trimmed café product and price", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => { renderer = create(<MenuRecipesPage />); });
    const root=renderer!.root;
    await act(async()=>button(root,"Add Product").props.onClick());
    const name=root.findAllByType("input").find((input)=>input.props.placeholder==="e.g., Spanish Latte")!;
    const price=root.findAllByType("input").find((input)=>input.props.placeholder==="0.00")!;
    const category=root.findAllByType("select").find((select)=>String(select.props["data-values"]).includes("category-1"))!;
    await act(async()=>{
      name.props.onChange({target:{value:"12345"}});
      price.props.onChange({target:{value:"149.95"}});
      category.props.onChange({target:{value:"category-1"}});
    });
    await act(async()=>button(root,"Create Menu Product").props.onClick());
    expect(mocks.createMenuProduct).not.toHaveBeenCalled();
    expect(root.findAllByType("span").some((node)=>nodeText(node).includes("at least one letter"))).toBe(true);

    await act(async()=>name.props.onChange({target:{value:"  2-in-1 Coffee  "}}));
    await act(async()=>button(root,"Create Menu Product").props.onClick());
    expect(mocks.createMenuProduct).toHaveBeenCalledOnce();
    expect(mocks.createMenuProduct).toHaveBeenCalledWith(expect.objectContaining({
      name:"2-in-1 Coffee",
      categoryId:"category-1",
      variants:[expect.objectContaining({name:"Standard",sellingPrice:149.95})],
    }));
  });

  it("autosaves incomplete menu product input without calling the creation API",async()=>{
    let renderer:ReactTestRenderer;
    await act(async()=>{renderer=create(<MenuRecipesPage/>);});
    const root=renderer!.root;
    await act(async()=>button(root,"Add Product").props.onClick());
    const name=root.findAllByType("input").find((input)=>input.props.placeholder==="e.g., Spanish Latte")!;
    vi.useFakeTimers();
    await act(async()=>name.props.onChange({target:{value:"Unfinished Latte"}}));
    await act(async()=>{vi.advanceTimersByTime(650);});
    vi.useRealTimers();
    expect(mocks.createMenuProduct).not.toHaveBeenCalled();
    expect([...localDraftValues.values()].some((value)=>value.includes("Unfinished Latte"))).toBe(true);
    renderer!.unmount();
  });
});
