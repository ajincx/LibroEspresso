import type { UserRole } from "./auth";
export type RecordStatus = "ACTIVE" | "INACTIVE";
export interface Branch { id:string; code:string; name:string; location:string; status:RecordStatus; manager?:string|null; managerId?:string|null; createdAt:string; updatedAt:string }
export interface ManagedUser { id:string; branchId:string|null; firstName:string; lastName:string; email:string; username:string; phoneNumber:string|null; position:string; role:UserRole; status:RecordStatus; branchCode:string|null; branchName:string|null; lastLoginAt:string|null; createdAt:string; updatedAt:string }
export interface InventoryItem { id:string; sku:string; name:string; category:string; unit:string; unitCost:number; reorderLevel:number; status:RecordStatus }
export interface MenuItem { id:string; code:string; name:string; category:string; sellingPrice:number; status:RecordStatus }
export interface MenuCategory { id:string; name:string; description:string; status:RecordStatus; createdAt:string; updatedAt:string }
export interface MenuProductIngredient { id:string; inventoryItemId:string; sku:string; name:string; quantity:number; unit:string; unitCost:number; ingredientCost:number }
export interface MenuProduct { id:string; code:string; name:string; category:string; categoryId:string|null; description:string; sellingPrice:number; status:RecordStatus; recipeId:string|null; recipeName:string|null; yieldQuantity:number|null; recipeCost:number; marginAmount:number; marginRate:number; ingredients:MenuProductIngredient[]; createdAt:string; updatedAt:string }
export interface RecipeIngredient { id:string; inventoryItemId:string; sku:string; name:string; quantity:number; unit:string; unitCost:number }
export interface Recipe { id:string; menuItemId:string; name:string; yieldQuantity:number; status:RecordStatus; menuItem:MenuItem; items:RecipeIngredient[] }
