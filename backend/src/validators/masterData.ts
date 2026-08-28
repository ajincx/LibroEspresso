import { z } from "zod";

export const idParams = z.object({ id: z.string().uuid() });
export const statusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });
export const branchInput = z.object({ code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()), name: z.string().trim().min(2).max(120), location: z.string().trim().min(2).max(255), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") });
export const branchPatch = branchInput.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

const userFields = z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), email: z.string().email().max(255), username: z.string().trim().min(3).max(80), phoneNumber: z.string().trim().max(30).nullable().optional(), position: z.string().trim().min(2).max(100).optional(), role: z.enum(["OWNER", "BRANCH_MANAGER"]), branchId: z.string().uuid().nullable(), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") });
const validAssignment = <T extends { role?: "OWNER" | "BRANCH_MANAGER"; branchId?: string | null }>(value: T) => value.role === undefined || (value.role === "OWNER" ? value.branchId === null : Boolean(value.branchId));
export const userCreate = userFields.extend({ password: z.string().min(10).max(128) }).refine(validAssignment, { message: "Owner branchId must be null; Branch Manager branchId is required", path: ["branchId"] });
export const userPatch = userFields.partial().extend({ password: z.string().min(10).max(128).optional() }).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const inventoryItemInput = z.object({ sku: z.string().trim().min(2).max(40).transform((v) => v.toUpperCase()), name: z.string().trim().min(2).max(160), category: z.string().trim().min(2).max(100), unit: z.string().trim().min(1).max(30), unitCost: z.coerce.number().min(0), reorderLevel: z.coerce.number().min(0).default(0), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") });
export const inventoryItemPatch = inventoryItemInput.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const menuItemInput = z.object({ code: z.string().trim().min(2).max(40).transform((v) => v.toUpperCase()), name: z.string().trim().min(2).max(160), category: z.string().trim().min(2).max(100), sellingPrice: z.coerce.number().min(0), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") });
export const menuItemPatch = menuItemInput.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const recipeInput = z.object({ menuItemId: z.string().uuid(), name: z.string().trim().min(2).max(160), yieldQuantity: z.coerce.number().positive().default(1), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"), items: z.array(z.object({ inventoryItemId: z.string().uuid(), quantity: z.coerce.number().positive(), unit: z.string().trim().min(1).max(30) })).min(1).refine((items) => new Set(items.map((item) => item.inventoryItemId)).size === items.length, "Recipe ingredients must be unique") });

const recipeItems = z.array(z.object({ inventoryItemId: z.string().uuid(), quantity: z.coerce.number().positive(), unit: z.string().trim().min(1).max(30) }))
  .min(1, "At least one recipe ingredient is required")
  .refine((items) => new Set(items.map((item) => item.inventoryItemId)).size === items.length, "Recipe ingredients must be unique");
export const menuProductInput = z.object({
  code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
  categoryId: z.string().uuid(),
  sellingPrice: z.coerce.number().positive(),
  description: z.string().trim().max(2000).default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  recipe: z.object({ name: z.string().trim().min(2).max(160), yieldQuantity: z.coerce.number().positive().default(1), items: recipeItems }),
});
export const menuCategoryInput = z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().max(1000).default(""), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") });
export const menuCategoryPatch = menuCategoryInput.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
