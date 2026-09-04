import React, { lazy, Suspense, useEffect, useState } from "react";
import { ModuleTabSwitcher, AnimatedTabPanel } from "../../components/ModuleUi";
import type { Page, Role } from "../../types/navigation";
const MenuRecipesPage = lazy(() => import("./MenuRecipesPage").then((module) => ({ default: module.MenuRecipesPage })));
const loadOperationalPages = () => import("../inventory/InventorySupportPages");
const ExpectedInventoryPage = lazy(() => loadOperationalPages().then((module) => ({ default: module.ExpectedInventoryPage })));

const recipeReferenceTabs = [
  { id: "recipes", label: "Standardized Recipes" },
  { id: "usage", label: "Ingredient Usage" },
] as const;

export function StandardizedRecipesModule({ role, initialTab = "recipes" }: {
  role: Role;
  initialTab?: "recipes" | "usage";
}) {
  const [activeTab, setActiveTab] = useState<"recipes" | "usage">(initialTab);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  return (
    <div>
      <ModuleTabSwitcher tabs={recipeReferenceTabs} active={activeTab} onChange={setActiveTab} />
      <AnimatedTabPanel panelKey={activeTab}>
        {activeTab === "recipes"
          ? <MenuRecipesPage readOnly />
          : <ExpectedInventoryPage role={role} view="usage" />}
      </AnimatedTabPanel>
    </div>
  );
}
