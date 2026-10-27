import { z } from "zod";
import { normalizeUnit } from "../services/unitConversion.service.js";

export const idParams = z.object({ id: z.string().uuid() });
export const statusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });
export const branchInput = z.object({ code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()), name: z.string().trim().min(2).max(120), location: z.string().trim().min(2).max(255), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") });
export const branchPatch = branchInput.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const normalizePersonName = (value: string) => value.trim().replace(/\s+/g, " ");
export const normalizeEmailAddress = (value: string) => value.trim().toLocaleLowerCase("en-US");
export const normalizePhilippineMobile = (value: string) => value.startsWith("09") ? `+63${value.slice(1)}` : value;
const personName = z.string().transform(normalizePersonName).pipe(z.string().min(1).max(80));
const emailAddress = z.string().transform(normalizeEmailAddress).pipe(z.string().email("Enter a valid email address").max(255));
const philippineMobile = z.string().trim().refine((value) => /^(?:09\d{9}|\+639\d{9})$/.test(value), "Enter a Philippine mobile number as 09XXXXXXXXX or +639XXXXXXXXX").transform(normalizePhilippineMobile);
const userFields = z.object({ firstName: personName, lastName: personName, email: emailAddress, username: z.string().trim().min(3).max(80), phoneNumber: z.union([philippineMobile,z.literal("").transform(() => null),z.null()]).optional(), position: z.string().trim().min(2).max(100).optional(), role: z.enum(["OWNER", "BRANCH_MANAGER", "STAFF"]), branchId: z.string().uuid().nullable(), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") });
const validAssignment = <T extends { role?: "OWNER" | "BRANCH_MANAGER" | "STAFF"; branchId?: string | null }>(value: T) => value.role === undefined || (value.role === "OWNER" ? value.branchId === null : Boolean(value.branchId));
export const userCreate = userFields.extend({ password: z.string().min(10).max(128) }).refine(validAssignment, { message: "Owner branchId must be null; Manager and Staff branchId are required", path: ["branchId"] });
export const userPatch = userFields.partial().extend({ password: z.string().min(10).max(128).optional() }).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const measurementUnit = z.string().trim().refine((unit) => {
  try { normalizeUnit(unit); return true; } catch { return false; }
}, "Select a supported unit: g, kg, ml, L, or pc").transform(normalizeUnit);
export const MAX_MENU_PRODUCT_PRICE_PHP = 10_000;
export const hasAtMostTwoDecimalPlaces = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
export const menuProductName = z.string().trim().min(2, "Product name is required").max(160, "Product name must be 160 characters or fewer")
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Product name cannot contain control characters")
  .refine((value) => /\p{L}/u.test(value), "Product name must contain at least one letter");
export const menuSellingPrice = z.coerce.number().finite("Selling price must be a finite number")
  .positive("Selling price must be greater than zero")
  .max(MAX_MENU_PRODUCT_PRICE_PHP, `Selling price must not exceed PHP ${MAX_MENU_PRODUCT_PRICE_PHP.toLocaleString()}`)
  .refine(hasAtMostTwoDecimalPlaces, "Selling price must have no more than two decimal places");
export const inventoryItemInput = z.object({ name: z.string().trim().min(2).max(160), category: z.string().trim().min(2).max(100), unit: measurementUnit, unitCost: z.coerce.number().min(0), reorderLevel: z.coerce.number().min(0).default(0), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") });
export const inventoryItemPatch = inventoryItemInput.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const menuItemInput = z.object({ code: z.string().trim().min(2).max(40).transform((v) => v.toUpperCase()), name: menuProductName, category: z.string().trim().min(2).max(100), sellingPrice: menuSellingPrice, status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") });
export const menuItemPatch = menuItemInput.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const recipeInput = z.object({ menuItemId: z.string().uuid(), menuItemVariantId: z.string().uuid(), name: z.string().trim().min(2).max(160), yieldQuantity: z.coerce.number().positive().default(1), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"), effectiveFrom: z.iso.date().optional(), changeReason: z.string().trim().max(1000).optional(), items: z.array(z.object({ inventoryItemId: z.string().uuid(), quantity: z.coerce.number().positive(), unit: measurementUnit })).min(1).refine((items) => new Set(items.map((item) => item.inventoryItemId)).size === items.length, "Recipe ingredients must be unique") });

const recipeItems = z.array(z.object({ inventoryItemId: z.string().uuid(), quantity: z.coerce.number().positive(), unit: measurementUnit }))
  .min(1, "At least one recipe ingredient is required")
  .refine((items) => new Set(items.map((item) => item.inventoryItemId)).size === items.length, "Recipe ingredients must be unique");
const variantRecipeInput = z.object({ yieldQuantity: z.coerce.number().positive().default(1), effectiveFrom: z.iso.date().optional(), changeReason: z.string().trim().max(1000).optional(), items: recipeItems });
export const menuProductInput = z.object({
    name: menuProductName,
    categoryId: z.string().uuid(),
    sellingPrice: menuSellingPrice.optional(),
    variants: z.array(z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(80), sellingPrice: menuSellingPrice, status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"), recipe: variantRecipeInput.optional() }))
      .min(1, "At least one size or variant is required")
      .refine((items) => items.some((item) => item.status === "ACTIVE"), "At least one variant must be active")
      .refine((items) => new Set(items.map((item) => item.name.toLocaleLowerCase())).size === items.length, "Variant names must be unique")
      .optional(),
    description: z.string().trim().max(2000).default(""),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
    recipe: variantRecipeInput.optional(),
  }).refine((value) => value.variants || value.sellingPrice, "A selling price or variants are required");
export const menuProductStatusInput = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });
export const menuProductReviewInput = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(1000).optional().default(""),
});
export const menuCategoryInput = z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().max(1000).default(""), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") });
export const menuCategoryPatch = menuCategoryInput.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
