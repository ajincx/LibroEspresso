import { api } from "./api";
import type { ApiSuccess } from "../types/auth";
import type { Branch, InventoryItem, ManagedUser, MenuCategory, MenuItem, MenuProduct, Recipe, RecordStatus } from "../types/masterData";

export const masterDataService = {
  async branches() { return (await api.get<ApiSuccess<{branches:Branch[]}>>("/branches")).data.data.branches; },
  async createBranch(input:{code:string;name:string;location:string;status:RecordStatus}) { return (await api.post<ApiSuccess<{branch:Branch}>>("/branches",input)).data.data.branch; },
  async updateBranch(id:string,input:Partial<Pick<Branch,"code"|"name"|"location"|"status">>) { return (await api.patch<ApiSuccess<{branch:Branch}>>(`/branches/${id}`,input)).data.data.branch; },
  async users() { return (await api.get<ApiSuccess<{users:ManagedUser[]}>>("/users")).data.data.users; },
  async createUser(input:{firstName:string;lastName:string;email:string;username:string;phoneNumber?:string|null;position?:string;password:string;role:"OWNER"|"BRANCH_MANAGER";branchId:string|null;status:RecordStatus}) { return (await api.post<ApiSuccess<{user:ManagedUser}>>("/users",input)).data.data.user; },
  async updateUser(id:string,input:Partial<{firstName:string;lastName:string;email:string;username:string;phoneNumber:string|null;position:string;password:string;role:"OWNER"|"BRANCH_MANAGER";branchId:string|null;status:RecordStatus}>) { return (await api.patch<ApiSuccess<{user:ManagedUser}>>(`/users/${id}`,input)).data.data.user; },
  async setUserStatus(id:string,status:RecordStatus) { await api.patch(`/users/${id}/status`,{status}); },
  async inventoryItems() { return (await api.get<ApiSuccess<{items:InventoryItem[]}>>("/inventory-items")).data.data.items; },
  async createInventoryItem(input:Omit<InventoryItem,"id">) { return (await api.post<ApiSuccess<{item:InventoryItem}>>("/inventory-items",input)).data.data.item; },
  async menuItems() { return (await api.get<ApiSuccess<{items:MenuItem[]}>>("/menu-items")).data.data.items; },
  async createMenuItem(input:Omit<MenuItem,"id">) { return (await api.post<ApiSuccess<{item:MenuItem}>>("/menu-items",input)).data.data.item; },
  async menuProducts() { return (await api.get<ApiSuccess<{products:MenuProduct[]}>>("/menu-items/with-recipes")).data.data.products; },
  async createMenuProduct(input:{code:string;name:string;categoryId:string;sellingPrice:number;description:string;status:RecordStatus;recipe:{name:string;yieldQuantity:number;items:{inventoryItemId:string;quantity:number;unit:string}[]}}) { return (await api.post<ApiSuccess<{product:MenuProduct}>>("/menu-items/with-recipe",input)).data.data.product; },
  async updateMenuProduct(id:string,input:{code:string;name:string;categoryId:string;sellingPrice:number;description:string;status:RecordStatus;recipe:{name:string;yieldQuantity:number;items:{inventoryItemId:string;quantity:number;unit:string}[]}}) { return (await api.put<ApiSuccess<{product:MenuProduct}>>(`/menu-items/${id}/with-recipe`,input)).data.data.product; },
  async menuCategories() { return (await api.get<ApiSuccess<{categories:MenuCategory[]}>>("/menu-categories")).data.data.categories; },
  async createMenuCategory(input:{name:string;description:string;status:RecordStatus}) { return (await api.post<ApiSuccess<{category:MenuCategory}>>("/menu-categories",input)).data.data.category; },
  async updateMenuCategory(id:string,input:Partial<{name:string;description:string;status:RecordStatus}>) { return (await api.patch<ApiSuccess<{category:MenuCategory}>>(`/menu-categories/${id}`,input)).data.data.category; },
  async recipes() { return (await api.get<ApiSuccess<{recipes:Recipe[]}>>("/recipes")).data.data.recipes; },
  async createRecipe(input:{menuItemId:string;name:string;yieldQuantity:number;status:RecordStatus;items:{inventoryItemId:string;quantity:number;unit:string}[]}) { return (await api.post<ApiSuccess<{recipe:Recipe}>>("/recipes",input)).data.data.recipe; },
};
