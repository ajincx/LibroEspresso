import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Boxes, Check, ChefHat, Edit3, Eye, FilePenLine, FolderOpen, PackagePlus, Plus, RefreshCw, Tags, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { masterDataService } from "../../services/masterData.service";
import type { InventoryItem, MenuCategory, MenuProduct, RecordStatus } from "../../types/masterData";
import { Btn, SearchInput, Select, SkeletonBlock, StatusBadge, TableCard, TableLoadingRow, TableWrapper, TD, THead, TR } from "../../components/ModuleUi";
import { formatAppCurrency } from "../../utils/appPreferences";
import { compatibleUnits, units } from "../../utils/units";
import { ControlledActionDialog, type ControlledActionValue } from "../../components/ControlledActionDialog";
import { useLocalDraftCollection, type LocalDraftEntry } from "../../hooks/useLocalDraft";

export type RecipeRow = { key: string; inventoryItemId: string; quantity: number | ""; unit: string };
export type VariantRow = { key:string; id?:string; name:string; sellingPrice:number|""; status:RecordStatus };
export type RecipeDraft = { yieldQuantity:number; effectiveFrom:string; changeReason:string; items:RecipeRow[] };
export type ProductForm = { name: string; categoryId: string; variants:VariantRow[]; description: string; status: RecordStatus; recipeVariantKey:string|null; recipeDrafts:Record<string,RecipeDraft> };
type IngredientForm = { name: string; categoryChoice: string; otherCategory: string; unit: string; unitCost: number | ""; reorderLevel: number | "" };
type CategoryForm = { name:string;description:string;status:RecordStatus };
const newRow = (): RecipeRow => ({ key: crypto.randomUUID(), inventoryItemId: "", quantity: 1, unit: "" });
const localToday=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;};
const emptyForm = (): ProductForm => ({ name: "", categoryId: "", variants:[{key:crypto.randomUUID(),name:"Standard",sellingPrice:"",status:"ACTIVE"}], description: "", status: "ACTIVE", recipeVariantKey:null, recipeDrafts:{} });
const isProductForm=(value:unknown):value is ProductForm=>Boolean(value&&typeof value==="object"&&typeof (value as ProductForm).name==="string"&&typeof (value as ProductForm).categoryId==="string"&&typeof (value as ProductForm).description==="string"&&Array.isArray((value as ProductForm).variants)&&(value as ProductForm).variants.every((variant)=>variant&&typeof variant.key==="string"&&typeof variant.name==="string")&&typeof (value as ProductForm).recipeDrafts==="object");
export const menuProductDraftIsMeaningful=(form:ProductForm)=>Boolean(form.name.trim()||form.categoryId||form.description.trim()||form.variants.some((variant)=>variant.name!=="Standard"||variant.sellingPrice!==""||variant.status!=="ACTIVE")||Object.keys(form.recipeDrafts).length);
export const menuProductDraftSummary=(form:ProductForm)=>`${form.name.trim()||"Unnamed menu product"} · ${form.variants.length} variant${form.variants.length===1?"":"s"}`;
export const revalidateMenuProductDraft=(form:ProductForm,categories:MenuCategory[],inventory:InventoryItem[]):ProductForm=>({
  ...form,
  categoryId:categories.some((category)=>category.id===form.categoryId&&category.status==="ACTIVE")?form.categoryId:"",
  recipeDrafts:Object.fromEntries(Object.entries(form.recipeDrafts).map(([key,draft])=>[key,{...draft,items:draft.items.map((item)=>inventory.some((candidate)=>candidate.id===item.inventoryItemId&&candidate.status==="ACTIVE")?item:{...item,inventoryItemId:"",unit:""})}]))
});
export const MENU_VARIANT_PRESETS = ["Standard", "Small", "Medium", "Large"] as const;
export const menuVariantSelection = (name:string) => MENU_VARIANT_PRESETS.includes(name.trim() as typeof MENU_VARIANT_PRESETS[number]) ? name.trim() : "Custom";
export const menuVariantNameForSelection = (currentName:string, selection:string) => selection === "Custom"
  ? (menuVariantSelection(currentName) === "Custom" ? currentName : "")
  : selection;
export const nextMenuVariantName = (variants:Pick<VariantRow,"name">[]) => {
  const used = new Set(variants.map((variant)=>variant.name.trim().toLowerCase()));
  return MENU_VARIANT_PRESETS.slice(1).find((name)=>!used.has(name.toLowerCase())) ?? "";
};
const emptyIngredientForm = (): IngredientForm => ({ name: "", categoryChoice: "", otherCategory: "", unit: "", unitCost: "", reorderLevel: "" });
const money = formatAppCurrency;
export const canManageMenuCategories=(role:string|undefined)=>role==="OWNER";
export const canDeleteMenuProduct=(role:string|undefined,product:Pick<MenuProduct,"productScope">)=>role==="OWNER"&&product.productScope==="GLOBAL";
export const isControlledTestProductRetirement=(role:string|undefined,product:Pick<MenuProduct,"code">)=>role==="OWNER"&&product.code==="PRD-00073";
export function CategoryLabel({name}:{name:string}){return <span>{name}</span>;}

export function MenuProductDeleteDialog({product,busy,value,onChange,onCancel,onConfirm}:{product:Pick<MenuProduct,"name">;busy:boolean;value:ControlledActionValue;onChange:(value:ControlledActionValue)=>void;onCancel:()=>void;onConfirm:()=>void}){
  return <ControlledActionDialog title="Delete Menu Product?" description={`Item: ${product.name}. Unused products are permanently deleted. If historical sales, mappings, recipes, incidents, COGS, or inventory evidence depend on this product, it will be deactivated instead.`} confirmLabel="Confirm Delete" value={value} busy={busy} requireVerificationPin={false} onChange={onChange} onCancel={onCancel} onConfirm={onConfirm}/>;
}
export function MenuProductsSkeleton() {
  const headings = ["Product Code", "Product Name", "Scope", "Category", "Selling Price", "Ingredients", "Recipe Cost", "Margin", "Status", "Actions"];
  return <div data-menu-products-skeleton role="status" aria-label="Loading menu products" className="overflow-hidden"><TableWrapper minWidth={940}><THead cols={headings}/><tbody>{Array.from({length:6},(_,index)=><TableLoadingRow key={index} colSpan={headings.length}/>)}</tbody></TableWrapper><span className="sr-only">Loading menu products</span></div>;
}
export const removeRecipeIngredientRow = (items: RecipeRow[], key: string) => items.filter((item) => item.key !== key);
export const recipeIngredientExists = (inventoryItemId: string, inventory: InventoryItem[]) =>
  inventory.some((item) => item.id === inventoryItemId && item.status === "ACTIVE");
export const normalizeRecipeQuantityInput = (value: string): number | "" => value === "" ? "" : Number(value);
export const isValidRecipeQuantity = (value: RecipeRow["quantity"]) => value !== "" && Number.isFinite(Number(value)) && Number(value) > 0;
export const MAX_MENU_PRODUCT_PRICE_PHP = 10_000;
export const hasAtMostTwoPriceDecimals = (value:number) => Math.abs(value*100-Math.round(value*100))<1e-8;
export const productNameValidationError = (value:string) => {
  const name=value.trim();
  if(name.length<2)return "Product name is required.";
  if(name.length>160)return "Product name must be 160 characters or fewer.";
  if(/[\p{Cc}\p{Cf}]/u.test(name))return "Product name cannot contain control characters.";
  if(!/\p{L}/u.test(name))return "Product name must contain at least one letter.";
  return "";
};
export const menuSellingPriceValidationError = (value:number|"") => {
  if(value===""||!Number.isFinite(value))return "Selling price must be a valid number.";
  if(value<=0)return "Selling price must be greater than zero.";
  if(value>MAX_MENU_PRODUCT_PRICE_PHP)return `Selling price must not exceed ₱${MAX_MENU_PRODUCT_PRICE_PHP.toLocaleString()}.`;
  if(!hasAtMostTwoPriceDecimals(value))return "Selling price must have no more than two decimal places.";
  return "";
};
export const selectInitialZeroQuantity = (input: Pick<HTMLInputElement, "value" | "select">) => {
  if (input.value !== "" && Number(input.value) === 0) input.select();
};
export const normalizedIngredientIds=(draft:RecipeDraft)=>[...new Set(draft.items.map((item)=>item.inventoryItemId))].sort();
export const ingredientSetsMatch = (first: RecipeDraft, second: RecipeDraft) =>
  JSON.stringify(normalizedIngredientIds(first)) === JSON.stringify(normalizedIngredientIds(second));
export const updatePendingRecipeDraftRow=(drafts:Record<string,RecipeDraft>,variantKey:string,rowKey:string,changes:Partial<RecipeRow>)=>{
  const draft=drafts[variantKey];
  if(!draft) return drafts;
  return {...drafts,[variantKey]:{...draft,items:draft.items.map((item)=>item.key===rowKey?{...item,...changes}:item)}};
};
export const attachPendingRecipeDrafts = (variants:VariantRow[], drafts:Record<string,RecipeDraft>) =>
  variants.map(({key,id,name,sellingPrice,status})=>({id,name:name.trim(),sellingPrice:Number(sellingPrice),status,...(drafts[key]?{recipe:{yieldQuantity:drafts[key].yieldQuantity,
    ...(drafts[key].effectiveFrom?{effectiveFrom:drafts[key].effectiveFrom,changeReason:drafts[key].changeReason}:{}),
    items:drafts[key].items.map(({inventoryItemId,quantity,unit})=>({inventoryItemId,quantity:Number(quantity),unit}))}}:{})}));
export const initializePendingRecipeDrafts=(selected:VariantRow,variants:VariantRow[],drafts:Record<string,RecipeDraft>,savedVariants:MenuProduct["variants"]|undefined,today:string)=>{
  const sized=["small","large"].includes(selected.name.trim().toLowerCase());
  const pendingVariants=sized?variants.filter((item)=>item.status==="ACTIVE"&&["small","large"].includes(item.name.trim().toLowerCase())):[selected];
  const next={...drafts};
  for(const pendingVariant of pendingVariants){
    if(next[pendingVariant.key]) continue;
    const existing=savedVariants?.find((item)=>item.id===pendingVariant.id);
    next[pendingVariant.key]={yieldQuantity:existing?.yieldQuantity??1,effectiveFrom:existing?.recipeHasHistoricalSales?today:"",changeReason:"",
      items:existing?.ingredients?.length?existing.ingredients.map((item)=>({key:item.id,inventoryItemId:item.inventoryItemId,quantity:item.quantity,unit:item.unit})):[newRow()]};
  }
  return next;
};

export function MenuRecipesPage() {
  const { user } = useAuth();
  const manager = user?.role === "BRANCH_MANAGER";
  const owner = user?.role === "OWNER";
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [editing, setEditing] = useState<MenuProduct | null>(null);
  const [productModal, setProductModal] = useState(false);
  const [categoryManagerOpen,setCategoryManagerOpen]=useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const productDrafts=useLocalDraftCollection<ProductForm>({userId:user?.id,branchId:user?.branchId,form:"menu-product-form"},isProductForm);
  const [activeProductDraftId,setActiveProductDraftId]=useState<string|null>(null);
  const activeProductDraftIdRef=useRef<string|null>(null);
  const productAutosaveTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const productAutosaveBlockedRef=useRef(false);
  const [productRecoveryDraftId,setProductRecoveryDraftId]=useState<string|null>(null);
  const [productDraftsOpen,setProductDraftsOpen]=useState(false);
  const [productExitOpen,setProductExitOpen]=useState(false);
  const [productDeleteDraftId,setProductDeleteDraftId]=useState<string|null>(null);
  const [productDraftError,setProductDraftError]=useState("");
  const [actionProductId, setActionProductId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuProduct | null>(null);
  const [deleteConfirmation,setDeleteConfirmation]=useState<ControlledActionValue>({reason:"",verificationPin:""});
  const [reviewTarget, setReviewTarget] = useState<MenuProduct | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [nextProducts, nextCategories, nextInventory] = await Promise.all([masterDataService.menuProducts(), masterDataService.menuCategories(), masterDataService.inventoryItems()]);
      setProducts(nextProducts); setCategories(nextCategories); setInventory(nextInventory);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load menu products"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const visibleCategories = useMemo(() => categories.filter((item) => item.status === "ACTIVE"), [categories]);
  const filtered = useMemo(() => products.filter((product) => {
    const query = search.trim().toLowerCase();
    return (category === "All" || product.category === category) && (!query || product.name.toLowerCase().includes(query) || product.code.toLowerCase().includes(query) || product.category.toLowerCase().includes(query));
  }), [products, category, search]);

  const resetProductDraftForm=()=>{setForm(emptyForm());setFormErrors({});setProductDraftError("");activeProductDraftIdRef.current=null;setActiveProductDraftId(null);};
  const openCreate = () => { setEditing(null);resetProductDraftForm();productAutosaveBlockedRef.current=false;setProductRecoveryDraftId(productDrafts.list()[0]?.id??null);setProductModal(true); };
  const openEdit = (product: MenuProduct) => {
    setEditing(product); setFormErrors({});
    setForm({ name: product.name, categoryId: product.categoryId ?? categories.find((item) => item.name === product.category)?.id ?? "", variants:product.variants.map((variant)=>({key:variant.id||crypto.randomUUID(),id:variant.id||undefined,name:variant.name,sellingPrice:variant.sellingPrice,status:variant.status})), description: product.description ?? "", status: product.status, recipeVariantKey:null, recipeDrafts:{} });
    setProductModal(true);
  };
  const persistProductDraft=()=>{const id=productDrafts.save(form,activeProductDraftIdRef.current??undefined);if(!id){setProductDraftError("Unable to save this draft in browser storage. Keep editing and check browser storage availability.");return "";}activeProductDraftIdRef.current=id;setActiveProductDraftId(id);setProductDraftError("");return id;};
  const continueProductDraft=(id:string)=>{const entry=productDrafts.read(id);if(!entry){setProductDraftError("This draft is unavailable or expired.");return;}setForm(revalidateMenuProductDraft(entry.value,categories,inventory));setFormErrors({});setProductDraftError("");activeProductDraftIdRef.current=id;setActiveProductDraftId(id);setProductRecoveryDraftId(null);setProductDraftsOpen(false);};
  const preventProductAutosave=()=>{productAutosaveBlockedRef.current=true;if(productAutosaveTimerRef.current){clearTimeout(productAutosaveTimerRef.current);productAutosaveTimerRef.current=null;}};
  useEffect(()=>{if(!productModal||editing||productRecoveryDraftId||productAutosaveBlockedRef.current||!menuProductDraftIsMeaningful(form))return;if(productAutosaveTimerRef.current)clearTimeout(productAutosaveTimerRef.current);productAutosaveTimerRef.current=setTimeout(()=>{if(!productAutosaveBlockedRef.current)persistProductDraft();},600);return()=>{if(productAutosaveTimerRef.current){clearTimeout(productAutosaveTimerRef.current);productAutosaveTimerRef.current=null;}};},[editing,form,productModal,productRecoveryDraftId]);
  const requestProductClose=()=>{if(editing||!menuProductDraftIsMeaningful(form)){preventProductAutosave();setProductModal(false);return;}setProductDraftError("");setProductExitOpen(true);};
  const saveProductDraftAndExit=()=>{if(!persistProductDraft())return;preventProductAutosave();setProductExitOpen(false);setProductModal(false);};
  const exitProductWithoutSaving=()=>{preventProductAutosave();if(activeProductDraftIdRef.current)productDrafts.remove(activeProductDraftIdRef.current);activeProductDraftIdRef.current=null;setActiveProductDraftId(null);setProductExitOpen(false);setProductModal(false);};
  const confirmDeleteProductDraft=()=>{if(!productDeleteDraftId)return;productDrafts.remove(productDeleteDraftId);if(activeProductDraftIdRef.current===productDeleteDraftId){activeProductDraftIdRef.current=null;setActiveProductDraftId(null);}setProductDeleteDraftId(null);};
  const validate = () => {
    const errors: Record<string, string> = {};
    const nameError=productNameValidationError(form.name);
    if(nameError)errors.name=nameError;
    if (!form.categoryId) errors.categoryId = "Category is required.";
    if (!form.variants.length || !form.variants.some((variant)=>variant.status==="ACTIVE")) errors.variants = "Keep at least one active size or variant.";
    if (form.variants.some((variant)=>!variant.name.trim())) errors.variants = "Give every variant a name.";
    else {
      const priceError=form.variants.map((variant)=>menuSellingPriceValidationError(variant.sellingPrice)).find(Boolean);
      if(priceError)errors.variants=priceError;
    }
    if (new Set(form.variants.map((variant)=>variant.name.trim().toLowerCase())).size!==form.variants.length) errors.variants = "Variant names must be unique.";
    const draftEntries=Object.entries(form.recipeDrafts);
    for(const [variantKey,draft] of draftEntries){
      const variant=form.variants.find((item)=>item.key===variantKey);
      if(!variant||variant.status!=="ACTIVE") errors.recipeVariantKey="Recipes may only be changed for active variants.";
      if(!draft.items.length) errors.items="Add at least one ingredient to every recipe being changed.";
      else if(draft.items.some((item)=>item.inventoryItemId&&!recipeIngredientExists(item.inventoryItemId,inventory))) errors.items="Select an existing active inventory ingredient for every recipe row.";
      else if(draft.items.some((item)=>!item.inventoryItemId||!isValidRecipeQuantity(item.quantity)||!item.unit)) errors.items="Complete every ingredient row with a positive quantity.";
      if(new Set(draft.items.map((item)=>item.inventoryItemId)).size!==draft.items.length) errors.items="Each inventory ingredient may only appear once per recipe.";
      if(editing?.variants.find((item)=>item.id===variant?.id)?.recipeHasHistoricalSales&&!draft.effectiveFrom) errors.effectiveFrom="Choose when each changed historical recipe becomes effective.";
    }
    const sizedVariants=form.variants.filter((variant)=>variant.status==="ACTIVE"&&(variant.name.trim().toLowerCase()==="small"||variant.name.trim().toLowerCase()==="large"));
    const effectiveDraft=(variant:VariantRow):RecipeDraft|undefined=>{
      if(form.recipeDrafts[variant.key]) return form.recipeDrafts[variant.key];
      const saved=editing?.variants.find((item)=>item.id===variant.id);
      if(!saved?.ingredients?.length) return undefined;
      return {yieldQuantity:saved.yieldQuantity??1,effectiveFrom:"",changeReason:"",items:saved.ingredients.map((item)=>({key:item.id,inventoryItemId:item.inventoryItemId,quantity:item.quantity,unit:item.unit}))};
    };
    const small=sizedVariants.find((variant)=>variant.name.trim().toLowerCase()==="small");
    const large=sizedVariants.find((variant)=>variant.name.trim().toLowerCase()==="large");
    const smallDraft=small?effectiveDraft(small):undefined;
    const largeDraft=large?effectiveDraft(large):undefined;
    if(smallDraft&&largeDraft&&!ingredientSetsMatch(smallDraft,largeDraft)) errors.items="Small and Large recipes must use the same ingredients; quantities may differ.";
    setFormErrors(errors); return Object.keys(errors).length === 0;
  };
  const saveProduct = async () => {
    if (!validate()) return;
    setSaving(true);
    const input = { name: form.name.trim(), categoryId: form.categoryId, variants:attachPendingRecipeDrafts(form.variants,form.recipeDrafts), description: form.description, status: form.status };
    const changesHistoricalRecipe=form.variants.some((variant)=>Boolean(form.recipeDrafts[variant.key]&&editing?.variants.find((item)=>item.id===variant.id)?.recipeHasHistoricalSales));
    try {
      if (editing) await masterDataService.updateMenuProduct(editing.id, input); else await masterDataService.createMenuProduct(input);
      const message = editing
        ? (manager ? "Changes submitted for Owner approval" : changesHistoricalRecipe?"New recipe versions saved; historical COGS was preserved":"Menu product updated")
        : (manager ? "Product submitted for Owner approval" : "Product sent to Branch Managers for review");
      toast.success(message);if(!editing){preventProductAutosave();if(activeProductDraftIdRef.current)productDrafts.remove(activeProductDraftIdRef.current);}setProductModal(false); await load();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to save product"); }
    finally { setSaving(false); }
  };

  const changeProductStatus = async (product: MenuProduct) => {
    const nextStatus: RecordStatus = product.branchMenuStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setActionProductId(product.id);
    try {
      await masterDataService.setMenuProductStatus(product.id, nextStatus);
      toast.success(`${product.name} is now ${nextStatus === "ACTIVE" ? "active" : "inactive"}`);
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Unable to update product status");
    } finally {
      setActionProductId(null);
    }
  };

  const deleteProduct = async () => {
    if (!deleteTarget) return;
    setActionProductId(deleteTarget.id);
    try {
      if(isControlledTestProductRetirement(user?.role,deleteTarget)){
        await masterDataService.retireTestMenuProduct(deleteTarget.id,deleteConfirmation);
        toast.success(`${deleteTarget.name} test product chain was retired`);
      }else{
        const result=await masterDataService.deleteMenuProduct(deleteTarget.id,{reason:deleteConfirmation.reason});
        toast.success(result.action==="DELETED"?`${deleteTarget.name} was deleted`:`${deleteTarget.name} was deactivated because history depends on it`);
      }
      setDeleteTarget(null);
      setDeleteConfirmation({reason:"",verificationPin:""});
      setSelected(null);
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Unable to delete product");
    } finally {
      setActionProductId(null);
    }
  };

  const reviewProduct = async (product: MenuProduct, decision: "APPROVE" | "REJECT", comment = "") => {
    setActionProductId(product.id);
    try {
      if (owner) await masterDataService.reviewManagerProduct(product.id, decision, comment);
      else await masterDataService.reviewOwnerProductForBranch(product.id, decision);
      toast.success(`${product.name} ${decision === "APPROVE" ? "approved" : "rejected"}`);
      setSelected(null);
      setReviewTarget(null);
      setReviewComment("");
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Unable to review product");
    } finally {
      setActionProductId(null);
    }
  };

  return <div className="p-4 md:p-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4"><div><h1 className="text-xl font-bold" style={{ color: "var(--app-text)" }}>Menu &amp; Recipe Management</h1><p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>{owner ? "Create global products and monitor each branch's availability decision." : "Manage approved products for your assigned branch."}</p></div><div className="flex gap-2 flex-wrap"><button onClick={() => void load()} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}><RefreshCw size={14} />Refresh</button>{owner && <button onClick={()=>setCategoryManagerOpen(true)} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold" style={{ borderColor:"var(--app-border)",background:"var(--app-surface)" }}><Tags size={15}/>Manage Categories</button>}{owner && <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--app-primary)" }}><Plus size={16} />Add Product</button>}</div></div>
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-primary-faint)", color: "var(--app-text-muted)" }}><BookOpen size={15} style={{ color: "var(--app-primary)" }} /><p className="text-sm">POS quantity sold × the sold variant's verified recipe determines expected inventory consumption.</p></div>
    <TableCard
      title="Menu Products & Recipes"
      subtitle={owner ? "Master recipe specifications and standard consumption yields" : "Branch product catalog and availability status"}
      badge={<span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">Products: {loading ? <SkeletonBlock w={22} h={10}/> : filtered.length}</span>}
      toolbar={
        <div className="flex flex-col md:flex-row gap-3 w-full">
          <SearchInput placeholder="Search menu products..." width={280} value={search} onChange={setSearch} />
          <Select className="md:w-52" value={category} onChange={setCategory} options={["All", ...visibleCategories.map((item) => item.name)]}/>
        </div>
      }
    >
      {loading ? (
        <MenuProductsSkeleton/>
      ) : error ? (
        <div className="p-16 text-center">
          <p className="text-sm mb-3 text-[var(--app-danger)]">{error}</p>
          <Btn variant="outline" size="sm" onClick={() => void load()}>Retry</Btn>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-16 text-center">
          <ChefHat className="mx-auto mb-3 text-[var(--app-text-muted)]" size={32} />
          <p className="font-semibold text-sm text-[var(--app-text)]">No menu products found.</p>
          <p className="text-xs text-[var(--app-text-muted)] mt-1">Try selecting another category or clear the search query.</p>
        </div>
      ) : (
        <ProductTable
          products={filtered}
          owner={owner}
          manager={manager}
          managerBranchId={user?.branchId ?? null}
          actionProductId={actionProductId}
          onView={setSelected}
          onEdit={openEdit}
          onToggleStatus={(product) => void changeProductStatus(product)}
          onDelete={setDeleteTarget}
          onOwnerReview={(product) => { setReviewTarget(product); setReviewComment(""); }}
          onManagerReview={(product, decision) => void reviewProduct(product, decision)}
        />
      )}
    </TableCard>
    {selected && <ProductDetails product={selected} owner={owner} canEdit={(owner && selected.productScope === "GLOBAL") || (manager && selected.productScope === "BRANCH" && selected.originBranchId === user?.branchId)} onClose={() => setSelected(null)} onEdit={() => { setSelected(null); openEdit(selected); }} />}
    {reviewTarget && <ProductReviewModal product={reviewTarget} categories={categories} comment={reviewComment} setComment={setReviewComment} saving={actionProductId === reviewTarget.id} onClose={() => { if (!actionProductId) { setReviewTarget(null); setReviewComment(""); } }} onDecision={(decision) => void reviewProduct(reviewTarget, decision, reviewComment)} />}
    {productModal && <ProductEditor editing={editing} form={form} setForm={setForm} errors={formErrors} categories={categories} inventory={owner ? inventory.filter((item) => item.itemScope === "GLOBAL") : inventory} canCreateIngredient={owner || manager} saving={saving} draftEntries={editing?[]:productDrafts.list()} activeDraftId={activeProductDraftId} recoveryDraft={productRecoveryDraftId?productDrafts.read(productRecoveryDraftId):null} draftError={productDraftError} draftsOpen={productDraftsOpen} onToggleDrafts={()=>setProductDraftsOpen((open)=>!open)} onResumeDraft={continueProductDraft} onStartNew={()=>{setProductRecoveryDraftId(null);resetProductDraftForm();}} onDeleteDraft={setProductDeleteDraftId} onInventoryCreated={(item) => setInventory((current) => [...current, item].sort((a, b) => a.name.localeCompare(b.name)))} onClose={requestProductClose} onSave={() => void saveProduct()} />}
    {productExitOpen&&<ProductDraftExitDialog error={productDraftError} onKeepEditing={()=>{setProductExitOpen(false);setProductDraftError("");}} onSaveDraft={saveProductDraftAndExit} onExit={exitProductWithoutSaving}/>}
    {productDeleteDraftId&&<ProductDraftDeleteDialog onCancel={()=>setProductDeleteDraftId(null)} onConfirm={confirmDeleteProductDraft}/>}
    {categoryManagerOpen&&canManageMenuCategories(user?.role)&&<CategoryManagerModal categories={categories} onClose={()=>setCategoryManagerOpen(false)} onChanged={load}/>}
    {deleteTarget && (isControlledTestProductRetirement(user?.role,deleteTarget)?<ControlledActionDialog title={`Retire ${deleteTarget.name} as test data?`} description="This preserves the product, Standard variant, recipe, recipe quantities, and history while making the approved UAT product chain non-operational. ING-00073 and its reorder settings are not changed." confirmLabel="Retire Test Product" value={deleteConfirmation} busy={Boolean(actionProductId)} onChange={setDeleteConfirmation} onCancel={()=>{setDeleteTarget(null);setDeleteConfirmation({reason:"",verificationPin:""});}} onConfirm={()=>void deleteProduct()}/>:<MenuProductDeleteDialog product={deleteTarget} value={deleteConfirmation} busy={Boolean(actionProductId)} onChange={setDeleteConfirmation} onCancel={()=>{setDeleteTarget(null);setDeleteConfirmation({reason:"",verificationPin:""});}} onConfirm={()=>void deleteProduct()}/>)}
  </div>;
}

export const marginTextClass = (margin:number|null) => margin === null ? "text-[var(--app-text-muted)]" : margin > 0 ? "text-[var(--app-success)]" : margin < 0 ? "text-[var(--app-danger)]" : "text-[var(--app-text-muted)]";
export const variantMarginRate = (sellingPrice:number,recipeCost:number|null) => recipeCost===null || sellingPrice<=0 ? null : (sellingPrice-recipeCost)/sellingPrice*100;

function ProductTable({ products, owner, manager, managerBranchId, actionProductId, onView, onEdit, onToggleStatus, onDelete, onOwnerReview, onManagerReview }: { products:MenuProduct[];owner:boolean;manager:boolean;managerBranchId:string|null;actionProductId:string|null;onView:(product:MenuProduct)=>void;onEdit:(product:MenuProduct)=>void;onToggleStatus:(product:MenuProduct)=>void;onDelete:(product:MenuProduct)=>void;onOwnerReview:(product:MenuProduct)=>void;onManagerReview:(product:MenuProduct,decision:"APPROVE"|"REJECT")=>void }) {
  const headings = ["Product Code", "Product Name", "Scope", "Category", "Selling Price", "Ingredients", "Recipe Cost", "Margin", "Status", "Actions"];
  return (
    <TableWrapper minWidth={940}>
      <THead cols={headings} />
      <tbody>
        {products.map((product) => {
          const busy = actionProductId === product.id;
          const canEdit = (owner && product.productScope === "GLOBAL") || (manager && product.productScope === "BRANCH" && product.originBranchId === managerBranchId);
          const canDelete = canDeleteMenuProduct(owner?"OWNER":manager?"BRANCH_MANAGER":undefined,product);
          const canToggle = manager && product.approvalStatus === "APPROVED" && product.branchAvailabilityStatus === "APPROVED";
          const awaitingOwnerReview = owner && product.productScope === "BRANCH" && product.approvalStatus === "PENDING_OWNER";
          const awaitingManagerReview = manager && product.productScope === "GLOBAL" && product.branchAvailabilityStatus === "PENDING_MANAGER";
          const displayedStatus = manager && product.branchAvailabilityStatus === "APPROVED" ? product.branchMenuStatus : null;
          return (
            <TR key={product.id} onClick={() => onView(product)} className="cursor-pointer" style={{ opacity: busy ? 0.65 : 1 }}>
              <TD mono><span className="font-bold text-[var(--app-primary)]">{product.code}</span></TD>
              <TD>
                <div className="font-semibold text-[var(--app-text)]">{product.name}</div>
                {product.description && <div className="text-[11px] max-w-52 truncate text-[var(--app-text-muted)]">{product.description}</div>}
              </TD>
              <TD>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--app-primary-faint)] text-[var(--app-primary)]">
                  {product.productScope === "GLOBAL" ? "All Branches" : product.originBranchName ?? "Branch"}
                </span>
              </TD>
              <TD muted><CategoryLabel name={product.category}/></TD>
              <TD right bold><div className="space-y-1">{product.variants.filter((variant)=>variant.status==="ACTIVE").map((variant)=><div key={variant.id} className="whitespace-nowrap"><span className="text-xs font-normal text-[var(--app-text-muted)]">{variant.name}: </span>{money(variant.sellingPrice)}</div>)}</div></TD>
              <TD right muted>{product.variants.filter((variant)=>variant.status==="ACTIVE").map((variant)=>variant.ingredients?.length??0).join(" / ")} item(s)</TD>
              <TD right muted><div className="space-y-1">{product.variants.filter((variant)=>variant.status==="ACTIVE").map((variant)=><div key={variant.id}>{variant.name}: {variant.recipeCost==null?"Not configured":money(variant.recipeCost)}</div>)}</div></TD>
              <TD right bold><div className="space-y-1">{product.variants.filter((variant)=>variant.status==="ACTIVE").map((variant)=>{const rate=variant.marginRate??null;return <div key={variant.id} className={marginTextClass(rate)}>{variant.name}: {rate===null?"Not available":`${rate.toFixed(1)}%`}</div>;})}</div></TD>
              <TD center>
                {displayedStatus ? (
                  <StatusBadge status={displayedStatus.toLowerCase()} />
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[var(--app-surface-muted)] text-[var(--app-text-muted)]">
                    {owner
                      ? (product.productScope === "GLOBAL" ? "Branch controlled" : product.approvalStatus.replaceAll("_", " "))
                      : (product.branchAvailabilityStatus ?? product.approvalStatus).replaceAll("_", " ")}
                  </span>
                )}
              </TD>
              <TD center onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                  {!awaitingOwnerReview && (
                    <Btn variant="outline" size="sm" icon={Eye} onClick={() => onView(product)}>
                      View
                    </Btn>
                  )}
                  {awaitingOwnerReview && (
                    <Btn size="sm" icon={Eye} disabled={busy} onClick={() => onOwnerReview(product)}>
                      Review
                    </Btn>
                  )}
                  {awaitingManagerReview && (
                    <>
                      <Btn size="sm" icon={Check} disabled={busy} onClick={() => onManagerReview(product, "APPROVE")}>
                        Approve
                      </Btn>
                      <Btn variant="danger" size="sm" disabled={busy} onClick={() => onManagerReview(product, "REJECT")}>
                        Reject
                      </Btn>
                    </>
                  )}
                  {canEdit && (
                    <>
                      <Btn variant="outline" size="sm" icon={Edit3} disabled={busy} onClick={() => onEdit(product)}>
                        Edit
                      </Btn>
                      {canDelete&&<button
                        disabled={busy}
                        title="Delete unused product"
                        aria-label={`Delete ${product.name}`}
                        onClick={() => onDelete(product)}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg border text-[var(--app-danger)] border-[var(--app-border)] hover:bg-[var(--app-danger-bg)] transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                      </button>}
                    </>
                  )}
                  {canToggle && (
                    <Btn
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => onToggleStatus(product)}
                    >
                      {product.branchMenuStatus === "ACTIVE" ? "Inactivate" : "Activate"}
                    </Btn>
                  )}
                </div>
              </TD>
            </TR>
          );
        })}
      </tbody>
    </TableWrapper>
  );
}

function ProductDetails({ product, owner, canEdit, onClose, onEdit }: { product: MenuProduct; owner: boolean; canEdit: boolean; onClose: () => void; onEdit: () => void }) {
  const approvedBranches = product.branchApprovals.filter((item) => item.status === "APPROVED").length;
  const approvalSummary = product.productScope === "GLOBAL"
    ? (owner ? `${approvedBranches}/${product.branchApprovals.length} branches approved` : (product.branchAvailabilityStatus ?? "NOT ASSIGNED").replaceAll("_", " "))
    : product.approvalStatus.replaceAll("_", " ");

  return <Modal onClose={onClose} width="max-w-2xl">
    <div className="flex justify-between gap-4"><div><h2 className="text-xl font-bold">{product.name}</h2><p className="text-xs font-mono mt-1" style={{ color: "var(--app-primary)" }}>{product.code}</p></div><button aria-label="Close product details" onClick={onClose}><X size={18} /></button></div>
    <p className="text-sm mt-4" style={{ color: "var(--app-text-muted)" }}>{product.description || "No product description."}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-5">{[{label:"Variants",value:String(product.variants.filter((variant)=>variant.status==="ACTIVE").length)},{label:"Recipes configured",value:`${product.variants.filter((variant)=>variant.status==="ACTIVE"&&variant.recipeId).length}/${product.variants.filter((variant)=>variant.status==="ACTIVE").length}`},{label:"Category",value:<CategoryLabel name={product.category}/>},{label:"Scope",value:product.productScope==="GLOBAL"?"All Branches":product.originBranchName??"Branch Product"}].map(({label,value})=><div key={label} className="p-3 rounded-xl" style={{background:"var(--app-bg)"}}><div className="text-[10px] uppercase" style={{color:"var(--app-text-faint)"}}>{label}</div><div className="font-bold mt-1">{value}</div></div>)}</div>
      <div className="flex flex-wrap gap-2 mb-4"><span className="px-2.5 py-1 rounded-full text-xs" style={{ background: "var(--app-primary-subtle)", color: "var(--app-primary)" }}><CategoryLabel name={product.category}/></span><span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "var(--app-primary-faint)", color: "var(--app-primary)" }}>{product.productScope === "GLOBAL" ? "All Branches" : product.originBranchName ?? "Branch Product"}</span>{!owner && product.branchAvailabilityStatus === "APPROVED" && product.branchMenuStatus && <StatusBadge status={product.branchMenuStatus} />}</div>
    <div className="p-4 rounded-xl border mb-5" style={{ borderColor:"var(--app-border)",background:"var(--app-surface-elevated)" }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color:"var(--app-text-faint)" }}>Approval</div>
      <div className="font-semibold mt-1 capitalize">{approvalSummary.toLowerCase()}</div>
      {owner && product.productScope === "GLOBAL" && product.branchApprovals.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{product.branchApprovals.map((item) => { const label=item.status === "APPROVED" ? (item.isActive ? "ACTIVE" : "INACTIVE") : item.status.replaceAll("_", " "); return <span key={item.branchId} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold" style={{ background:label === "ACTIVE" ? "var(--app-success-bg)" : label === "REJECTED" ? "var(--app-danger-bg)" : "var(--app-primary-faint)",color:label === "ACTIVE" ? "var(--app-success)" : label === "REJECTED" ? "var(--app-danger)" : label === "INACTIVE" ? "var(--app-text-muted)" : "var(--app-warning)" }}>{item.branchName}: {label}</span>; })}</div>}
      {product.ownerReviewComment && <div className="mt-3 pt-3 border-t text-sm" style={{ borderColor:"var(--app-border)",color:"var(--app-text-muted)" }}><strong style={{ color:"var(--app-text)" }}>Owner comment:</strong> {product.ownerReviewComment}</div>}
    </div>
    <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{color:"var(--app-text-muted)"}}>Variant recipes and margins</h3>
    <div className="space-y-3">{product.variants.filter((variant)=>variant.status==="ACTIVE").map((variant)=><div key={variant.id} className="rounded-xl border p-4" style={{borderColor:"var(--app-border)"}}><div className="flex flex-wrap justify-between gap-2"><div className="font-bold">{variant.name} · {money(variant.sellingPrice)}</div><div className="text-xs text-[var(--app-text-muted)]">{variant.recipeId?`Recipe v${variant.recipeVersion??1} · Yield ${variant.yieldQuantity??1}`:"Recipe not configured"}</div></div><div className="grid grid-cols-3 gap-2 mt-3 text-sm"><div>Recipe cost<br/><strong>{variant.recipeCost==null?"Not available":money(variant.recipeCost)}</strong></div><div>Margin<br/><strong>{variant.marginAmount==null?"Not available":money(variant.marginAmount)}</strong></div><div>Margin rate<br/><strong className={marginTextClass(variant.marginRate??null)}>{variant.marginRate==null?"Not available":`${variant.marginRate.toFixed(1)}%`}</strong></div></div><div className="mt-3 border-t pt-2 text-xs" style={{borderColor:"var(--app-border)"}}>{variant.ingredients?.length?variant.ingredients.map((item)=><div key={item.id} className="flex justify-between gap-2 py-1"><span>{item.name} · {item.quantity} {item.unit}</span><span>{money(item.ingredientCost)}</span></div>):"No verified ingredient recipe for this variant."}</div></div>)}</div>
    {product.variants.some((variant)=>(variant.recipeHistory?.length??0)>0)&&<div className="mt-5"><h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{color:"var(--app-text-muted)"}}>Variant Recipe History</h3>{product.variants.filter((variant)=>(variant.recipeHistory?.length??0)>0).map((variant)=><div key={variant.id} className="rounded-xl border p-3 mb-2" style={{borderColor:"var(--app-border)"}}><div className="font-semibold text-sm">{variant.name}</div>{variant.recipeHistory?.map((item)=><div key={item.id} className="text-xs mt-1 text-[var(--app-text-muted)]">Version {item.version}: {item.effectiveFrom} → {item.effectiveTo??"Present"} · {item.status}</div>)}</div>)}</div>}
    {canEdit && <button onClick={onEdit} className="w-full mt-5 py-2.5 rounded-xl text-white font-semibold" style={{ background: "var(--app-primary)" }}>Edit Product &amp; Recipe</button>}
  </Modal>;
}

function ProductReviewModal({ product, categories, comment, setComment, saving, onClose, onDecision }: { product:MenuProduct;categories:MenuCategory[];comment:string;setComment:(value:string)=>void;saving:boolean;onClose:()=>void;onDecision:(decision:"APPROVE"|"REJECT")=>void }) {
  return <Modal onClose={onClose} width="max-w-2xl">
    <div className="flex justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-wider" style={{ color:"var(--app-warning)" }}>Pending Owner Approval</div><h2 className="text-xl font-bold mt-1">Review {product.name}</h2><p className="text-xs mt-1" style={{ color:"var(--app-text-muted)" }}>Submitted by {product.createdByName ?? "Branch Manager"} · {product.originBranchName ?? "Assigned branch"}</p></div><button aria-label="Close product review" disabled={saving} onClick={onClose}><X size={18}/></button></div>
    <p className="text-sm mt-4 p-3 rounded-xl" style={{ color:"var(--app-text-muted)",background:"var(--app-bg)" }}>{product.description || "No product description."}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-5">{[{label:"Product Code",value:product.code},{label:"Category",value:<CategoryLabel name={product.category}/>},{label:"Variants",value:String(product.variants.filter((variant)=>variant.status==="ACTIVE").length)},{label:"Recipes configured",value:`${product.variants.filter((variant)=>variant.recipeId).length}/${product.variants.length}`}].map(({label,value})=><div key={label} className="p-3 rounded-xl border" style={{borderColor:"var(--app-border)"}}><div className="text-[10px] uppercase" style={{color:"var(--app-text-faint)"}}>{label}</div><div className="font-bold mt-1">{value}</div></div>)}</div>
    <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{color:"var(--app-text-muted)"}}>Proposed Variant Recipes</h3>
    <div className="space-y-2">{product.variants.filter((variant)=>variant.status==="ACTIVE").map((variant)=><div key={variant.id} className="rounded-xl border p-3" style={{borderColor:"var(--app-border)"}}><div className="font-semibold text-sm">{variant.name} · {money(variant.sellingPrice)} · Cost: {variant.recipeCost==null?"Not available":money(variant.recipeCost)}</div><div className="text-xs mt-1 text-[var(--app-text-muted)]">{variant.ingredients?.length?variant.ingredients.map((item)=>`${item.name}: ${item.quantity} ${item.unit}`).join(" · "):"No recipe configured"}</div></div>)}</div>
    <label className="block text-sm font-semibold mt-5">Comment <span className="font-normal" style={{ color:"var(--app-text-faint)" }}>(optional)</span><textarea maxLength={1000} value={comment} onChange={(event)=>setComment(event.target.value)} placeholder="Add suggestions or explain your decision…" rows={3} className="mt-2 w-full px-3 py-2.5 rounded-xl border resize-none outline-none" style={inputStyle}/><span className="block text-right text-[10px] mt-1" style={{ color:"var(--app-text-faint)" }}>{comment.length}/1000</span></label>
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-5"><button disabled={saving} onClick={onClose} className="px-4 py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-50" style={{ borderColor:"var(--app-border)" }}>Cancel</button><button disabled={saving} onClick={()=>onDecision("REJECT")} className="px-4 py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-50" style={{ borderColor:"var(--app-danger)",color:"var(--app-danger)" }}>{saving?"Saving…":"Reject"}</button><button disabled={saving} onClick={()=>onDecision("APPROVE")} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background:"var(--app-success)" }}>{saving?"Saving…":"Approve Product"}</button></div>
  </Modal>;
}

function CategoryManagerModal({categories,onClose,onChanged}:{categories:MenuCategory[];onClose:()=>void;onChanged:()=>Promise<void>}){
  const empty:CategoryForm={name:"",description:"",status:"ACTIVE"};
  const [editing,setEditing]=useState<MenuCategory|null>(null);
  const [form,setForm]=useState<CategoryForm>(empty);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const startCreate=()=>{setEditing(null);setForm(empty);setError("");};
  const startEdit=(category:MenuCategory)=>{setEditing(category);setForm({name:category.name,description:category.description,status:category.status});setError("");};
  const save=async()=>{
    if(form.name.trim().length<2){setError("Category name must contain at least 2 characters.");return;}
    setSaving(true);setError("");
    try{
      if(editing) await masterDataService.updateMenuCategory(editing.id,{name:form.name.trim(),description:form.description.trim(),status:form.status});
      else await masterDataService.createMenuCategory({name:form.name.trim(),description:form.description.trim(),status:form.status});
      toast.success(editing?"Category updated":"Category created");
      await onChanged();startCreate();
    }catch(reason){setError(reason instanceof Error?reason.message:"Unable to save category");}
    finally{setSaving(false);}
  };
  return <Modal onClose={onClose} width="max-w-3xl">
    <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Menu Categories</h2><p className="text-sm mt-1 text-[var(--app-text-muted)]">Rename categories without changing their stable identity, and add optional user guidance.</p></div><button aria-label="Close category management" disabled={saving} onClick={onClose}><X size={18}/></button></div>
    <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1.2fr]">
      <div className="overflow-hidden rounded-2xl border" style={{borderColor:"var(--app-border)"}}><div className="flex items-center justify-between border-b px-4 py-3" style={{borderColor:"var(--app-border)"}}><span className="text-xs font-bold uppercase tracking-wider text-[var(--app-text-muted)]">Existing categories</span><Btn size="sm" variant="outline" icon={Plus} onClick={startCreate}>New</Btn></div><div className="max-h-96 divide-y overflow-y-auto" style={{borderColor:"var(--app-border)"}}>{categories.map((category)=><button type="button" key={category.id} onClick={()=>startEdit(category)} className="w-full px-4 py-3.5 text-left hover:bg-[var(--app-primary-faint)]"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{category.name}</span><StatusBadge status={category.status.toLowerCase()}/></div><div className="mt-1.5 line-clamp-2 text-xs text-[var(--app-text-muted)]">{category.description||"No description"}</div></button>)}</div></div>
      <div className="rounded-2xl border p-4 md:p-5" style={{borderColor:"var(--app-border)",background:"var(--app-surface-elevated)"}}><h3 className="text-base font-bold">{editing?`Edit ${editing.name}`:"Create category"}</h3><p className="mt-1 text-xs text-[var(--app-text-muted)]">Use a clear name and optional guidance for menu organization.</p><div className="mt-5 space-y-5"><Field label="Category Name *" value={form.name} onChange={(name)=>setForm((current)=>({...current,name}))}/><label className="block text-sm font-semibold">Description <span className="font-normal text-[var(--app-text-faint)]">(optional)</span><textarea value={form.description} maxLength={1000} rows={4} onChange={(event)=>setForm((current)=>({...current,description:event.target.value}))} className="mt-2 w-full resize-none rounded-xl border px-4 py-3 outline-none" style={inputStyle} placeholder="Explain this category in user-friendly terms."/></label><SelectField label="Status" value={form.status} onChange={(status)=>setForm((current)=>({...current,status:status as RecordStatus}))} options={[{value:"ACTIVE",label:"Active"},{value:"INACTIVE",label:"Inactive"}]}/>{error&&<p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p>}<div className="flex justify-end gap-2 border-t pt-4" style={{borderColor:"var(--app-border)"}}><Btn variant="outline" disabled={saving} onClick={startCreate}>Clear</Btn><Btn disabled={saving} onClick={()=>void save()}>{saving?"Saving…":editing?"Save Category":"Create Category"}</Btn></div></div></div>
    </div>
  </Modal>;
}

function ProductDraftExitDialog({error,onKeepEditing,onSaveDraft,onExit}:{error:string;onKeepEditing:()=>void;onSaveDraft:()=>void;onExit:()=>void}){return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><div role="alertdialog" aria-modal="true" aria-label="Exit Without Submitting?" className="w-full max-w-lg rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl"><h3 className="text-lg font-bold">Exit Without Submitting?</h3><p className="mt-2 text-sm text-[var(--app-text-muted)]">You have unfinished changes. Would you like to save them as a draft?</p>{error&&<p role="alert" className="mt-3 text-sm text-[var(--app-danger)]">{error}</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Btn variant="outline" onClick={onKeepEditing}>Keep Editing</Btn><Btn variant="outline" onClick={onSaveDraft}>Save as Draft</Btn><Btn variant="danger" onClick={onExit}>Exit Without Saving</Btn></div></div></div>;}
function ProductDraftDeleteDialog({onCancel,onConfirm}:{onCancel:()=>void;onConfirm:()=>void}){return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><div role="alertdialog" aria-modal="true" aria-label="Delete Menu Product Draft?" className="w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl"><h3 className="text-lg font-bold">Delete Menu Product Draft?</h3><p className="mt-2 text-sm text-[var(--app-text-muted)]">This removes only the selected browser-local draft.</p><div className="mt-5 flex justify-end gap-2"><Btn variant="outline" onClick={onCancel}>Cancel</Btn><Btn variant="danger" onClick={onConfirm}>Delete Draft</Btn></div></div></div>;}

function ProductEditor({ editing, form, setForm, errors, categories, inventory, canCreateIngredient, saving, draftEntries, activeDraftId, recoveryDraft, draftError, draftsOpen, onToggleDrafts, onResumeDraft, onStartNew, onDeleteDraft, onInventoryCreated, onClose, onSave }: { editing: MenuProduct|null; form: ProductForm; setForm: React.Dispatch<React.SetStateAction<ProductForm>>; errors: Record<string,string>; categories: MenuCategory[]; inventory: InventoryItem[]; canCreateIngredient:boolean; saving:boolean; draftEntries:LocalDraftEntry<ProductForm>[];activeDraftId:string|null;recoveryDraft:LocalDraftEntry<ProductForm>|null;draftError:string;draftsOpen:boolean;onToggleDrafts:()=>void;onResumeDraft:(id:string)=>void;onStartNew:()=>void;onDeleteDraft:(id:string)=>void;onInventoryCreated:(item:InventoryItem)=>void; onClose:()=>void; onSave:()=>void }) {
  const [ingredientTarget,setIngredientTarget]=useState<{variantKey:string;rowKey:string}|null>(null);
  const selectedRecipeVariant=form.variants.find((variant)=>variant.key===form.recipeVariantKey);
  const existingRecipeVariant=editing?.variants.find((variant)=>variant.id===selectedRecipeVariant?.id);
  const selectedRecipeDraft=selectedRecipeVariant?form.recipeDrafts[selectedRecipeVariant.key]:undefined;
  const chooseRecipeVariant=(variant:VariantRow)=>{
    setForm((current)=>({...current,recipeVariantKey:variant.key,
      recipeDrafts:initializePendingRecipeDrafts(variant,current.variants,current.recipeDrafts,editing?.variants,localToday())}));
  };
  const updateRecipeDraft=(changes:Partial<RecipeDraft>)=>setForm((current)=>{const key=current.recipeVariantKey;if(!key||!current.recipeDrafts[key])return current;return {...current,recipeDrafts:{...current.recipeDrafts,[key]:{...current.recipeDrafts[key],...changes}}};});
  const updateRow=(variantKey:string,key:string,changes:Partial<RecipeRow>)=>setForm((current)=>({...current,recipeDrafts:updatePendingRecipeDraftRow(current.recipeDrafts,variantKey,key,changes)}));
  const appendRow=(variantKey:string)=>{const row=newRow();setForm((current)=>{const draft=current.recipeDrafts[variantKey];if(!draft)return current;return {...current,recipeDrafts:{...current.recipeDrafts,[variantKey]:{...draft,items:[...draft.items,row]}}};});return row.key;};
  return <>
    <Modal onClose={onClose} width="max-w-5xl">
      <div className="-m-6 mb-6 px-6 py-5 flex items-start justify-between gap-4 border-b" style={{background:"linear-gradient(135deg,var(--app-primary-faint),var(--app-surface))",borderColor:"var(--app-border)"}}>
        <div className="flex items-start gap-3"><div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm" style={{background:"var(--app-primary)"}}><ChefHat size={21}/></div><div><h2 className="text-xl font-bold">{editing?"Edit Menu Product":"Add Menu Product"}</h2><p className="text-sm mt-1" style={{color:"var(--app-text-muted)"}}>Save the product and its sizes. Add a recipe when verified ingredients are available.</p></div></div>
        <button aria-label="Close form" onClick={onClose} className="w-9 h-9 rounded-xl border flex items-center justify-center" style={{borderColor:"var(--app-border)",background:"var(--app-surface)"}}><X size={18}/></button>
      </div>
      {!editing&&recoveryDraft&&<section className="mb-5 rounded-2xl border border-[var(--app-primary)] bg-[var(--app-primary-faint)] p-4"><p className="font-semibold">Resume Menu Product Draft?</p><p className="mt-1 text-xs text-[var(--app-text-muted)]">{menuProductDraftSummary(recoveryDraft.value)}</p><div className="mt-3 flex gap-2"><Btn size="sm" onClick={()=>onResumeDraft(recoveryDraft.id)}>Resume Draft</Btn><Btn size="sm" variant="outline" onClick={onStartNew}>Start New</Btn></div></section>}
      {!editing&&draftsOpen&&<section aria-label="Temporary menu product drafts" className="mb-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4"><h3 className="font-semibold">Temporary Menu Product Drafts</h3><p className="text-xs text-[var(--app-text-muted)]">Browser-only unfinished forms; no product or recipe is created until submission.</p>{draftEntries.length===0?<p className="py-5 text-center text-sm text-[var(--app-text-muted)]">No saved menu product drafts.</p>:<ul className="mt-3 space-y-2">{draftEntries.map((draft)=><li key={draft.id} className="flex flex-col gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-semibold">{menuProductDraftSummary(draft.value)}</p></div><div className="flex gap-2"><button type="button" onClick={()=>onResumeDraft(draft.id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--app-primary)]"><FilePenLine size={13}/>Continue/Edit</button><button type="button" onClick={()=>onDeleteDraft(draft.id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--app-danger)]"><Trash2 size={13}/>Delete Draft</button></div></li>)}</ul>}</section>}
      {!editing&&activeDraftId&&<p className="mb-4 text-xs text-[var(--app-text-muted)]">Autosaving this menu product draft on this device.</p>}{draftError&&<p role="alert" className="mb-4 text-sm text-[var(--app-danger)]">{draftError}</p>}
      <section className="rounded-2xl border p-4 md:p-5" style={{borderColor:"var(--app-border)",background:"var(--app-surface-elevated)"}}>
        <div className="flex items-center gap-2 mb-4"><BookOpen size={16} style={{color:"var(--app-primary)"}}/><h3 className="text-xs font-bold uppercase tracking-wider" style={{color:"var(--app-primary)"}}>Product Information</h3></div>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Product Name *" value={form.name} error={errors.name} placeholder="e.g., Spanish Latte" onChange={(value)=>setForm((current)=>({...current,name:value}))}/>
          <div><SelectField label="Category *" value={form.categoryId} error={errors.categoryId} onChange={(value)=>setForm((current)=>({...current,categoryId:value}))} options={categories.filter((item)=>item.status==="ACTIVE"||item.id===form.categoryId).map((item)=>({value:item.id,label:item.name}))}/>{categories.find((item)=>item.id===form.categoryId)?.description&&<p className="mt-1.5 text-xs text-[var(--app-text-muted)]">{categories.find((item)=>item.id===form.categoryId)!.description}</p>}</div>
          <div className="md:col-span-2 space-y-3"><div className="flex justify-between items-center"><h4 className="text-sm font-semibold">Sizes / Variants *</h4><button type="button" onClick={()=>setForm((current)=>({...current,variants:[...current.variants,{key:crypto.randomUUID(),name:nextMenuVariantName(current.variants),sellingPrice:"",status:"ACTIVE"}]}))} className="text-xs font-semibold text-[var(--app-primary)]">+ Add variant</button></div>{form.variants.map((variant)=><div key={variant.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(170px,1fr)_minmax(150px,1fr)_auto_auto] sm:items-end"><div className="space-y-2"><SelectField label="Size / Variant" value={menuVariantSelection(variant.name)} onChange={(selection)=>setForm((current)=>({...current,variants:current.variants.map((item)=>item.key===variant.key?{...item,name:menuVariantNameForSelection(item.name,selection)}:item)}))} options={[...MENU_VARIANT_PRESETS.map((name)=>({value:name,label:name})),{value:"Custom",label:"Custom"}]}/>{menuVariantSelection(variant.name)==="Custom"&&<Field label="Custom variant name" value={variant.name} placeholder="e.g., 16 oz" onChange={(value)=>setForm((current)=>({...current,variants:current.variants.map((item)=>item.key===variant.key?{...item,name:value}:item)}))}/>}</div><Field label="Selling Price" type="number" value={variant.sellingPrice} placeholder="0.00" onChange={(value)=>setForm((current)=>({...current,variants:current.variants.map((item)=>item.key===variant.key?{...item,sellingPrice:value===""?"":Number(value)}:item)}))}/><button type="button" className="h-12 px-3 text-xs rounded-xl border" style={{borderColor:"var(--app-border)"}} onClick={()=>setForm((current)=>({...current,variants:current.variants.map((item)=>item.key===variant.key?{...item,status:item.status==="ACTIVE"?"INACTIVE":"ACTIVE"}:item)}))}>{variant.status==="ACTIVE"?"Active":"Inactive"}</button><button type="button" disabled={form.variants.length===1} title={variant.id?"Deactivate saved variant":"Remove new variant"} className="h-12 px-3 rounded-xl border disabled:opacity-30" style={{borderColor:"var(--app-border)",color:"var(--app-danger)"}} onClick={()=>setForm((current)=>({...current,variants:variant.id?current.variants.map((item)=>item.key===variant.key?{...item,status:"INACTIVE"}:item):current.variants.filter((item)=>item.key!==variant.key)}))}><Trash2 size={15}/></button></div>)}{errors.variants&&<p className="text-xs text-[var(--app-danger)]">{errors.variants}</p>}</div>
          <label className="md:col-span-2 text-sm font-semibold">Description <span className="font-normal" style={{color:"var(--app-text-faint)"}}>(optional)</span><textarea value={form.description} onChange={(event)=>setForm((current)=>({...current,description:event.target.value}))} placeholder="Add a short product description…" rows={3} className="mt-2 w-full px-4 py-3 rounded-2xl border resize-none outline-none transition-shadow focus:ring-2" style={inputStyle}/></label>
        </div>
      </section>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">{form.variants.filter((variant)=>variant.status==="ACTIVE").map((variant)=>{const saved=editing?.variants.find((item)=>item.id===variant.id);return <div key={variant.key} className="rounded-2xl border p-4" style={{borderColor:form.recipeVariantKey===variant.key?"var(--app-primary)":"var(--app-border)",background:"var(--app-surface-elevated)"}}><div className="font-semibold">{variant.name||"New variant"} · {variant.sellingPrice===""?"Price pending":money(Number(variant.sellingPrice))}</div><p className="text-xs mt-1 text-[var(--app-text-muted)]">Recipe cost: {saved?.recipeCost==null?"Not available":money(saved.recipeCost)} · Margin: {saved?.marginAmount==null?"Not available":money(saved.marginAmount)}</p><button type="button" onClick={()=>form.recipeVariantKey===variant.key?setForm((current)=>({...current,recipeVariantKey:null})):chooseRecipeVariant(variant)} className="mt-3 px-3 py-2 rounded-xl border text-xs font-semibold" style={{borderColor:"var(--app-border)",color:"var(--app-primary)"}}>{form.recipeVariantKey===variant.key?"Done Editing Recipe":form.recipeDrafts[variant.key]?"Continue Recipe Changes":saved?.recipeId?"Edit Recipe":"Add Recipe"}</button></div>;})}</div>
      {errors.recipeVariantKey&&<p className="text-xs text-[var(--app-danger)]">{errors.recipeVariantKey}</p>}
      {selectedRecipeDraft&&<section className="rounded-2xl border p-4 md:p-5 mt-5" style={{borderColor:"var(--app-border)",background:"var(--app-surface-elevated)"}}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div><div className="flex items-center gap-2"><Boxes size={16} style={{color:"var(--app-primary)"}}/><h3 className="text-xs font-bold uppercase tracking-wider" style={{color:"var(--app-primary)"}}>{selectedRecipeVariant?.name||"Variant"} Recipe Ingredients</h3></div><p className="text-xs mt-1.5" style={{color:"var(--app-text-muted)"}}>Changes for each variant remain pending until Save Changes. Small and Large must use the same ingredients; quantities may differ.</p></div>
          <div className="flex gap-2 flex-wrap">{canCreateIngredient&&<button type="button" onClick={()=>{const variantKey=selectedRecipeVariant?.key;if(!variantKey)return;setIngredientTarget({variantKey,rowKey:selectedRecipeDraft.items.find((item)=>!item.inventoryItemId)?.key??appendRow(variantKey)});}} className="inline-flex gap-2 items-center px-3 py-2 rounded-xl border text-xs font-semibold" style={{borderColor:"var(--app-primary)",color:"var(--app-primary)",background:"var(--app-primary-faint)"}}><PackagePlus size={14}/>New Inventory Ingredient</button>}<button type="button" onClick={()=>{if(selectedRecipeVariant)appendRow(selectedRecipeVariant.key);}} className="inline-flex gap-2 items-center px-3 py-2 rounded-xl text-xs font-semibold text-white shadow-sm" style={{background:"var(--app-primary)"}}><Plus size={14}/>Add Recipe Row</button></div>
        </div>
        {!canCreateIngredient&&<div className="mb-4 px-4 py-3 rounded-xl text-xs" style={{background:"var(--app-warning-bg)",color:"var(--app-text-muted)"}}>Missing an ingredient? Ask the Owner to add it to the centralized inventory catalog, then refresh this form.</div>}
        {existingRecipeVariant?.recipeHasHistoricalSales&&<div className="mb-4 p-4 rounded-xl border" style={{background:"var(--app-warning-bg)",borderColor:"var(--app-warning)",color:"var(--app-text-muted)"}}><p className="text-sm font-semibold" style={{color:"var(--app-text)"}}>This variant has historical sales.</p><p className="text-xs mt-1">Saving these changes will create a new recipe version and will not modify previous COGS records.</p><div className="grid sm:grid-cols-2 gap-3 mt-3"><Field label="New Version Effective Date *" type="date" value={selectedRecipeDraft.effectiveFrom} error={errors.effectiveFrom} onChange={(value)=>updateRecipeDraft({effectiveFrom:value})}/><Field label="Change Reason (optional)" value={selectedRecipeDraft.changeReason} placeholder="e.g., Updated serving size" onChange={(value)=>updateRecipeDraft({changeReason:value})}/></div></div>}
        <div className="space-y-3">{selectedRecipeDraft.items.map((row,index)=>{const ingredient=inventory.find((candidate)=>candidate.id===row.inventoryItemId);return <div key={row.key} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_130px_160px_46px] gap-3 items-end p-3.5 rounded-2xl border" style={{background:"var(--app-bg)",borderColor:"var(--app-border)"}}>
          <SelectField label={index===0?"Ingredient":""} value={row.inventoryItemId} searchable searchPlaceholder="Search ingredients…" onChange={(value)=>{if(!selectedRecipeVariant)return;const item=inventory.find((candidate)=>candidate.id===value);updateRow(selectedRecipeVariant.key,row.key,{inventoryItemId:value,unit:item?.unit??""});}} options={inventory.filter((item)=>item.status==="ACTIVE").map((item)=>({value:item.id,label:`${item.name} (${item.sku})`}))}/>
          <Field label={index===0?"Quantity":""} type="number" value={row.quantity} placeholder="0.00" selectInitialZero onChange={(value)=>{if(selectedRecipeVariant)updateRow(selectedRecipeVariant.key,row.key,{quantity:normalizeRecipeQuantityInput(value)});}}/>
          <SelectField label={index===0?"Recipe Unit":""} value={row.unit} onChange={(value)=>{if(selectedRecipeVariant)updateRow(selectedRecipeVariant.key,row.key,{unit:value});}} options={compatibleUnits(ingredient?.unit??"").map((unit)=>({value:unit,label:unit}))}/>
          <button type="button" aria-label={`Remove ${ingredient?.name??"ingredient"} from recipe`} onClick={()=>updateRecipeDraft({items:removeRecipeIngredientRow(selectedRecipeDraft.items,row.key)})} className="h-[46px] rounded-xl border flex items-center justify-center" style={{color:"var(--app-danger)",borderColor:"var(--app-border)",background:"var(--app-surface)"}} title="Remove ingredient from this recipe"><Trash2 size={15}/></button>
        </div>;})}</div>
        {errors.items&&<p className="text-xs mt-3" style={{color:"var(--app-danger)"}}>{errors.items}</p>}
      </section>}
      <div className="flex flex-wrap justify-end gap-3 mt-6"><button type="button" disabled={saving} onClick={onSave} className="px-6 py-3 rounded-xl text-white text-sm font-semibold shadow-md disabled:opacity-50" style={{background:"var(--app-primary)"}}>{saving?"Saving…":editing?"Save Changes":"Create Menu Product"}</button>{!editing&&draftEntries.length>0&&<button type="button" onClick={onToggleDrafts} className="inline-flex items-center gap-2 rounded-xl border border-[var(--app-border)] px-5 py-3 text-sm font-semibold text-[var(--app-primary)]"><FolderOpen size={15}/>View Drafts ({draftEntries.length})</button>}<button type="button" onClick={onClose} className="px-5 py-3 rounded-xl border text-sm font-semibold" style={{borderColor:"var(--app-border)",background:"var(--app-surface)"}}>Cancel</button></div>
    </Modal>
    {ingredientTarget&&<IngredientEditorModal categories={Array.from(new Set(inventory.map((item)=>item.category))).sort()} onClose={()=>setIngredientTarget(null)} onCreated={(item)=>{onInventoryCreated(item);updateRow(ingredientTarget.variantKey,ingredientTarget.rowKey,{inventoryItemId:item.id,unit:item.unit});setIngredientTarget(null);}}/>}
  </>;
}

export function IngredientEditorModal({categories,onClose,onCreated}:{categories:string[];onClose:()=>void;onCreated:(item:InventoryItem)=>void}) {
  const [form,setForm]=useState<IngredientForm>(emptyIngredientForm);
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    const next:Record<string,string>={};
    if(!form.name.trim())next.name="Ingredient name is required.";
    const category=form.categoryChoice==="__OTHER__"?form.otherCategory.trim():form.categoryChoice;
    if(!category)next.category="Category is required.";
    if(!form.unit)next.unit="Unit is required.";
    if(form.unitCost===""||form.unitCost<0)next.unitCost="Enter a valid unit cost.";
    if(form.reorderLevel===""||form.reorderLevel<0)next.reorderLevel="Enter a valid reorder level.";
    setErrors(next);if(Object.keys(next).length)return;
    setSaving(true);
    try{const item=await masterDataService.createInventoryItem({name:form.name.trim(),category,unit:form.unit,unitCost:Number(form.unitCost),reorderLevel:Number(form.reorderLevel),status:"ACTIVE"});toast.success(`${item.name} added to the inventory catalog`);onCreated(item);}
    catch(reason){toast.error(reason instanceof Error?reason.message:"Unable to create ingredient");}
    finally{setSaving(false);}
  };
  return <Modal onClose={onClose} width="max-w-2xl">
    <div className="-m-6 mb-6 px-6 py-5 flex items-start justify-between border-b" style={{background:"linear-gradient(135deg,var(--app-primary-faint),var(--app-surface))",borderColor:"var(--app-border)"}}><div className="flex gap-3"><div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white" style={{background:"var(--app-primary)"}}><PackagePlus size={20}/></div><div><h2 className="text-xl font-bold">Add Inventory Ingredient</h2><p className="text-sm mt-1" style={{color:"var(--app-text-muted)"}}>This ingredient becomes available to recipes and branch inventory.</p></div></div><button aria-label="Close form" onClick={onClose} className="w-9 h-9 rounded-xl border flex items-center justify-center" style={{borderColor:"var(--app-border)",background:"var(--app-surface)"}}><X size={18}/></button></div>
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Ingredient Name *" value={form.name} error={errors.name} placeholder="e.g., Oat Milk" onChange={(value)=>setForm((current)=>({...current,name:value}))}/>
      <div><SelectField label="Category *" value={form.categoryChoice} error={errors.category} onChange={(value)=>setForm((current)=>({...current,categoryChoice:value,otherCategory:value==="__OTHER__"?current.otherCategory:""}))} options={[...categories.map((category)=>({value:category,label:category})),{value:"__OTHER__",label:"Others"}]}/>{form.categoryChoice==="__OTHER__"&&<div className="mt-3"><Field label="Specify Category *" value={form.otherCategory} error={errors.category} placeholder="Enter new category" onChange={(value)=>setForm((current)=>({...current,otherCategory:value}))}/></div>}</div>
      <SelectField label="Inventory Unit *" value={form.unit} error={errors.unit} onChange={(value)=>setForm((current)=>({...current,unit:value}))} options={units.map((unit)=>({value:unit,label:unit}))}/>
      <Field label="Unit Cost *" type="number" value={form.unitCost} error={errors.unitCost} placeholder="0.00" onChange={(value)=>setForm((current)=>({...current,unitCost:value===""?"":Number(value)}))}/>
      <Field label="Reorder Level *" type="number" value={form.reorderLevel} error={errors.reorderLevel} placeholder="0.00" onChange={(value)=>setForm((current)=>({...current,reorderLevel:value===""?"":Number(value)}))}/>
    </div>
    <div className="mt-5 px-4 py-3 rounded-xl text-xs leading-relaxed" style={{background:"var(--app-primary-faint)",color:"var(--app-text-muted)"}}>A Branch Manager must physically verify an initial quantity before this ingredient can affect branch stock.</div>
    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6"><button type="button" disabled={saving} onClick={onClose} className="px-5 py-3 rounded-xl border text-sm font-semibold disabled:opacity-50" style={{borderColor:"var(--app-border)"}}>Cancel</button><button type="button" disabled={saving} onClick={()=>void save()} className="px-6 py-3 rounded-xl text-white text-sm font-semibold shadow-md disabled:opacity-50" style={{background:"var(--app-primary)"}}>{saving?"Adding…":"Add Ingredient"}</button></div>
  </Modal>;
}

function Modal({ children, onClose, width }: { children:React.ReactNode; onClose:()=>void; width:string }) { return <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 backdrop-blur-sm" style={{ background:"rgba(24,10,14,.58)" }} onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><div role="dialog" aria-modal="true" aria-label="Dialog" className={`w-full ${width} max-h-[94vh] overflow-y-auto rounded-3xl border p-6 shadow-2xl`} style={{ background:"var(--app-surface)",borderColor:"var(--app-border)",boxShadow:"0 30px 80px rgba(43,14,22,.24)" }}>{children}</div></div>; }
const inputStyle = { borderColor:"var(--app-border)",background:"var(--app-surface-elevated)",color:"var(--app-text)" };
function Field({ label,value,onChange,type="text",error,disabled=false,placeholder,selectInitialZero=false }: { label:string;value:string|number;onChange:(value:string)=>void;type?:string;error?:string;disabled?:boolean;placeholder?:string;selectInitialZero?:boolean }) { return <label className="text-sm font-semibold">{label}<input disabled={disabled} type={type} min={type==="number"?0:undefined} step={type==="number"?"0.01":undefined} value={value} placeholder={placeholder} onFocus={(event)=>{if(selectInitialZero)selectInitialZeroQuantity(event.currentTarget);}} onChange={(event)=>onChange(event.target.value)} className="mt-2 w-full min-h-12 px-4 py-3 rounded-2xl border outline-none transition-all focus:ring-2 disabled:opacity-70" style={{...inputStyle,borderColor:error?"var(--app-danger)":"var(--app-border)"}}/>{error&&<span className="block text-xs mt-1.5" style={{ color:"var(--app-danger)" }}>{error}</span>}</label>; }
function SelectField({ label,value,onChange,options,error,searchable=false,searchPlaceholder }: { label:string;value:string;onChange:(value:string)=>void;options:{value:string;label:string}[];error?:string;searchable?:boolean;searchPlaceholder?:string }) { return <label className="text-sm font-medium">{label}<Select className="mt-1.5 w-full" value={value} onChange={onChange} options={[{ value:"", label:"Select…" }, ...options]} searchable={searchable} searchPlaceholder={searchPlaceholder}/>{error&&<span className="block text-xs mt-1" style={{ color:"var(--app-danger)" }}>{error}</span>}</label>; }
