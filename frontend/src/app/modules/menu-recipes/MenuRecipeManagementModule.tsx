import { lazy, useEffect, useState } from "react";
import { AnimatedTabPanel, ModuleTabSwitcher } from "../../components/ModuleUi";
import type { Role } from "../../types/navigation";

const MenuRecipesPage = lazy(() => import("./MenuRecipesPage").then((module) => ({ default: module.MenuRecipesPage })));
const loadOperationalPages = () => import("../inventory/InventorySupportPages");
const ExpectedInventoryPage = lazy(() => loadOperationalPages().then((module) => ({ default: module.ExpectedInventoryPage })));

const tabs = [
  { id: "recipes", label: "Menu & Standard Recipes" },
  { id: "usage", label: "Ingredient Usage" },
] as const;

export function MenuRecipeManagementModule({ role, initialTab = "recipes" }: {
  role: Role;
  initialTab?: "recipes" | "usage";
}) {
  const [activeTab, setActiveTab] = useState<"recipes" | "usage">(initialTab);
  useEffect(() => setActiveTab(initialTab), [initialTab]);

  return <div>
    <ModuleTabSwitcher tabs={tabs} active={activeTab} onChange={setActiveTab}/>
    <AnimatedTabPanel panelKey={activeTab}>
      {activeTab === "recipes" ? <MenuRecipesPage/> : <ExpectedInventoryPage role={role} view="usage"/>}
    </AnimatedTabPanel>
  </div>;
}
