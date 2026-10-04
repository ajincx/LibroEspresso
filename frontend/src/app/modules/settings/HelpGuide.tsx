import { useMemo, useState, type ElementType } from "react";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  FileBarChart,
  Gauge,
  LayoutDashboard,
  Package,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  UsersRound,
  UtensilsCrossed,
} from "lucide-react";
import type { UserRole } from "../../types/auth";
import { isPageAllowed, type AppPage } from "../../routes/routeConfig";

export type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  page: AppPage;
  roles?: UserRole[];
  steps: string[];
  tips?: string[];
  related?: string[];
  keywords?: string[];
};

export type HelpSection = {
  id: string;
  title: string;
  description: string;
  topics: HelpTopic[];
};

const helpSections: HelpSection[] = [
  {
    id: "quick-start",
    title: "Quick Start",
    description: "Start with the tasks available to your role.",
    topics: [
      {
        id: "owner-quick-start",
        title: "Owner quick start",
        summary: "Review the business across branches and act on items awaiting approval.",
        page: "dashboard",
        roles: ["OWNER"],
        steps: [
          "Open Dashboard to review consolidated sales, costs, stock alerts, and pending work.",
          "Use the branch filters when you need to focus on one location.",
          "Review classifications, purchase orders, reports, users, and branches from their dedicated modules.",
          "Use Settings to maintain your account, preferences, and business information.",
        ],
        related: ["owner-dashboard", "owner-classification-review", "owner-business-settings"],
      },
      {
        id: "manager-quick-start",
        title: "Branch Manager quick start",
        summary: "Run daily branch tasks in the correct order.",
        page: "dashboard",
        roles: ["BRANCH_MANAGER"],
        steps: [
          "Check Dashboard alerts and pending branch work.",
          "Import the day's completed sales using the configured branch sales source.",
          "Record the physical stock count from Inventory Counts when required.",
          "Create and receive purchase orders, then investigate material stock differences.",
        ],
        related: ["manager-dashboard", "import-sales", "record-physical-count", "create-purchase-order"],
      },
      {
        id: "staff-quick-start",
        title: "Staff quick start",
        summary: "Use the Staff Portal for assigned daily actions and incident reporting.",
        page: "dashboard",
        roles: ["STAFF"],
        steps: [
          "Open the Staff Portal to review your available actions.",
          "Record an incident promptly when stock is spilled, spoiled, damaged, or otherwise affected.",
          "Add every affected item and supporting details before submitting.",
          "Use Settings to manage your profile, password, notifications, and display preferences.",
        ],
        related: ["staff-portal", "submit-incident", "personal-settings"],
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Understand the information and actions shown when you sign in.",
    topics: [
      {
        id: "owner-dashboard",
        title: "Owner dashboard",
        summary: "Monitor performance and attention items across authorized branches.",
        page: "dashboard",
        roles: ["OWNER"],
        steps: [
          "Review the summary cards for sales, product cost, profit, and stock conditions.",
          "Use branch and date controls to change the reporting view.",
          "Open the relevant module when a card or alert needs further review.",
          "Treat dashboard values as a summary; use the detailed module for the supporting records.",
        ],
        related: ["review-sales-cogs", "inventory-overview", "view-reports"],
      },
      {
        id: "manager-dashboard",
        title: "Branch Manager dashboard",
        summary: "Review the assigned branch and start common daily tasks.",
        page: "dashboard",
        roles: ["BRANCH_MANAGER"],
        steps: [
          "Review the branch summary and inventory alerts.",
          "Use the quick actions to open sales import, inventory counting, or purchasing.",
          "Follow up on unresolved incidents and stock differences.",
          "Refresh after completing a workflow to see the latest branch information.",
        ],
        related: ["import-sales", "record-physical-count", "manager-investigation"],
      },
      {
        id: "staff-portal",
        title: "Staff Portal",
        summary: "Access staff-facing actions without exposing management modules.",
        page: "dashboard",
        roles: ["STAFF"],
        steps: [
          "Use the available cards to open your permitted tasks.",
          "Submit complete incident details and evidence when an event affects stock.",
          "Check messages and notifications for follow-up from your manager.",
        ],
        related: ["submit-incident", "personal-settings"],
      },
    ],
  },
  {
    id: "cogs-sales",
    title: "COGS & POS Sales",
    description: "Review sales, recipe-based product cost, and import status.",
    topics: [
      {
        id: "review-sales-cogs",
        title: "Review sales and COGS",
        summary: "Read branch sales, recipe-based costs, and gross profit for a period.",
        page: "cogs",
        steps: [
          "Choose the permitted branch and reporting period.",
          "Review sales, units sold, COGS, and gross profit together.",
          "Use the product and ingredient breakdowns to understand the totals.",
          "Remember that incident and shrinkage values are reviewed separately from recipe-based COGS.",
        ],
        related: ["import-sales", "recipe-basics", "view-reports"],
      },
      {
        id: "import-sales",
        title: "Import POS sales",
        summary: "Preview and import a supported sales file for the assigned branch.",
        page: "sales",
        roles: ["BRANCH_MANAGER"],
        steps: [
          "Confirm the branch, configured sales source, and business date.",
          "Choose the supported sales file and run the preview.",
          "Resolve any unmapped sellable items before importing.",
          "Confirm the preview totals, then submit the import once.",
          "Review the completed import and its reconciliation result.",
        ],
        tips: ["A duplicate file is blocked to protect sales and ingredient usage from being counted twice."],
        related: ["review-sales-cogs", "inventory-overview"],
        keywords: ["upload", "point of sale"],
      },
    ],
  },
  {
    id: "menu-recipes",
    title: "Menu & Recipe Management",
    description: "Understand products, variants, ingredients, and recipe history.",
    topics: [
      {
        id: "recipe-basics",
        title: "Products, variants, and recipes",
        summary: "Understand how menu variants connect sales to ingredient use.",
        page: "menu",
        steps: [
          "Find the menu product and open its recipe details.",
          "Review each variant separately, such as Small and Large.",
          "Confirm that each ingredient uses an existing inventory item and a compatible unit.",
          "Review quantities carefully because saved recipes guide future ingredient usage and COGS.",
        ],
        tips: ["Small and Large variants must use the same ingredient set, although their quantities may differ."],
        related: ["maintain-recipes", "review-sales-cogs"],
      },
      {
        id: "maintain-recipes",
        title: "Maintain a standard recipe",
        summary: "Safely add, remove, or adjust ingredients for future sales.",
        page: "menu",
        roles: ["OWNER"],
        steps: [
          "Open the product editor and select the variant to update.",
          "Choose ingredients from the existing inventory list; typed text does not create a new item.",
          "Enter positive quantities and confirm the recipe unit.",
          "For paired variants, complete both drafts before saving.",
          "Save once and review the newly active recipe version.",
        ],
        tips: ["Previously recorded sales usage remains tied to its saved historical snapshot."],
        related: ["recipe-basics", "inventory-overview"],
      },
    ],
  },
  {
    id: "inventory",
    title: "Inventory Management",
    description: "Monitor expected stock, starting stock, counts, and item activity.",
    topics: [
      {
        id: "inventory-overview",
        title: "Inventory Overview",
        summary: "Monitor the current expected stock for each permitted branch.",
        page: "inventory",
        steps: [
          "Select a branch when your role permits branch selection.",
          "Search by item name or code and review the stock status.",
          "Open View Details to see Starting Stock, sales consumption, stock movements, count resets, and the running balance.",
          "Use the ledger to understand why the expected stock changed.",
        ],
        related: ["starting-stock", "record-physical-count", "stock-statuses"],
      },
      {
        id: "inventory-measures",
        title: "Understand inventory measures",
        summary: "Read System Stock, inventory value, expected stock, physical count, and status consistently.",
        page: "inventory",
        steps: [
          "System Stock is the quantity Libro currently expects based on recorded stock activity.",
          "Inventory Value applies the item's unit cost to the current expected quantity.",
          "Expected Stock is the calculated quantity before a physical check; Physical Count is what was actually found.",
          "Low Stock means the quantity is at or below the reorder level, Critical means it is at or below half that level, and Out of Stock means no usable quantity remains.",
        ],
        related: ["inventory-overview", "stock-statuses", "record-physical-count"],
      },
      {
        id: "starting-stock",
        title: "Starting Stock",
        summary: "Understand the initial stock recorded when a branch begins using Libro.",
        page: "inventory",
        steps: [
          "Open Starting Stock from Inventory Management.",
          "Choose the permitted branch to review its initial stock baseline.",
          "Treat Starting Stock as the fixed starting point, not a recurring physical count.",
          "Use Inventory Overview for the changing expected balance.",
        ],
        related: ["inventory-overview", "record-physical-count"],
      },
      {
        id: "stock-statuses",
        title: "Stock statuses and reorder levels",
        summary: "Interpret Normal, Low, and Critical stock indicators.",
        page: "inventory",
        steps: [
          "Compare System Stock with the branch-specific reorder level.",
          "Open the item ledger before acting on an unexpected value.",
          "Use the status as an attention signal, then confirm supplier and operational needs before ordering.",
        ],
        related: ["inventory-overview", "monitor-purchase-orders"],
      },
      {
        id: "configure-reorder-policy",
        title: "Configure reorder policy",
        summary: "Set a branch-specific category, coverage policy, and reorder level.",
        page: "inventory",
        roles: ["OWNER"],
        steps: [
          "Open the reorder configuration for the selected branch and item.",
          "Choose Fast, Medium, or Slow and review the coverage days.",
          "Enter the approved reorder level in the item's system unit.",
          "Provide the required reason and save the change.",
        ],
        tips: ["Changing category or coverage days does not automatically replace the explicitly configured reorder level."],
        related: ["stock-statuses", "inventory-overview"],
      },
      {
        id: "record-physical-count",
        title: "Record a physical inventory count",
        summary: "Record and verify the stock physically available at the branch.",
        page: "physical-count",
        roles: ["BRANCH_MANAGER"],
        steps: [
          "Open Inventory Counts and choose Record Stock Count.",
          "Confirm the count date and review the expected quantities.",
          "Enter each physical quantity. You may use g or kg for gram-based items, and ml or L for milliliter-based items.",
          "Review the converted system quantity and previewed difference.",
          "Submit only after all countable items are complete.",
        ],
        tips: ["A positive difference means actual stock is above expected; a negative difference means a shortage."],
        related: ["count-history", "review-variance", "manager-investigation"],
      },
      {
        id: "count-history",
        title: "Physical Count History",
        summary: "Review submitted counts and open the details permitted for your role.",
        page: "physical-count-history",
        steps: [
          "Open Inventory Counts to view the summary history.",
          "Select View to read a count, or Edit when correction is available to your role.",
          "Review expected, physical, difference, and value information in the detail view.",
          "Return to history after viewing or saving a permitted correction.",
        ],
        related: ["record-physical-count", "review-variance"],
      },
    ],
  },
  {
    id: "purchase-orders",
    title: "Purchase Orders",
    description: "Create, receive, or monitor replenishment orders according to your role.",
    topics: [
      {
        id: "create-purchase-order",
        title: "Create a purchase order",
        summary: "Prepare a branch order after the required physical count is submitted.",
        page: "purchase-orders",
        roles: ["BRANCH_MANAGER"],
        steps: [
          "Open Purchase Orders and choose New Purchase Order.",
          "Select the supplier, order date, and expected delivery date.",
          "Add each ingredient, quantity, unit, conversion where required, and unit cost.",
          "Confirm that a physical count is submitted for the branch and order date.",
          "Save a draft when the order is not ready, or create the order when all details are confirmed.",
        ],
        tips: ["If Physical Inventory Count Required appears, go to Inventory Counts and submit the count for the selected order date before creating the order."],
        related: ["receive-purchase-order", "record-physical-count", "stock-statuses"],
      },
      {
        id: "receive-purchase-order",
        title: "Receive a purchase order",
        summary: "Record a full or partial delivery without counting the same receipt twice.",
        page: "purchase-orders",
        roles: ["BRANCH_MANAGER"],
        steps: [
          "Open the order and review ordered, previously received, and remaining quantities.",
          "Enter the delivered quantity and a receipt date after the latest physical count and not before the order date.",
          "Confirm the receipt details and submit.",
          "Review the updated received total and the resulting stock activity.",
        ],
        related: ["monitor-purchase-orders", "inventory-overview"],
      },
      {
        id: "monitor-purchase-orders",
        title: "Monitor purchase orders",
        summary: "Track order status, quantities, and receipt progress.",
        page: "purchase-orders",
        roles: ["OWNER"],
        steps: [
          "Filter the list by branch, supplier, date, or status.",
          "Open an order to review ordered and received quantities.",
          "Use the status to distinguish open, partly received, received, and cancelled orders.",
          "Use Inventory Overview to confirm the stock effect of completed receipts.",
        ],
        related: ["inventory-overview", "view-reports"],
      },
      {
        id: "purchase-order-statuses",
        title: "Understand purchase order statuses",
        summary: "Follow an order from preparation through final receipt.",
        page: "purchase-orders",
        steps: [
          "Draft means the order is saved but not yet placed.",
          "Ordered means the order has been placed and is awaiting delivery.",
          "Partially Received means some, but not all, ordered stock has been recorded.",
          "Received means all ordered quantities are complete; Cancelled means the order will not continue.",
        ],
        related: ["create-purchase-order", "receive-purchase-order", "monitor-purchase-orders"],
      },
    ],
  },
  {
    id: "variance",
    title: "Variance & Discrepancies",
    description: "Understand differences between expected and physically counted stock.",
    topics: [
      {
        id: "review-variance",
        title: "Read an inventory variance",
        summary: "Interpret the result of Actual Stock minus Expected Stock.",
        page: "variance",
        steps: [
          "Open Variance & Discrepancies and select the branch and period.",
          "Compare expected stock with the submitted physical quantity.",
          "Read a negative value as a shortage and a positive value as excess stock.",
          "Review the percentage, value, tolerance, and current investigation status.",
        ],
        related: ["record-physical-count", "manager-investigation", "owner-classification-review"],
      },
      {
        id: "manager-investigation",
        title: "Investigate a discrepancy",
        summary: "Review evidence and submit a supported classification for Owner review.",
        page: "shrinkage",
        roles: ["BRANCH_MANAGER"],
        steps: [
          "Open the detected case for your assigned branch.",
          "Review the count difference and available staff incident evidence.",
          "Record findings and choose the classification supported by the evidence.",
          "Submit the findings for Owner review.",
        ],
        tips: ["An unexplained shortage is not automatically classified as theft or pilferage."],
        related: ["review-variance", "review-incident-evidence"],
      },
    ],
  },
  {
    id: "classification-review",
    title: "Classification Review",
    description: "Complete the manager investigation and Owner review process.",
    topics: [
      {
        id: "manager-classification",
        title: "Submit manager findings",
        summary: "Complete the branch investigation and send findings for review.",
        page: "shrinkage",
        roles: ["BRANCH_MANAGER"],
        steps: [
          "Confirm the count and variance information.",
          "Review linked incident evidence and add investigation notes.",
          "Choose the supported classification and submit the findings.",
          "If the Owner returns the case, update the findings and resubmit it.",
        ],
        related: ["manager-investigation", "review-incident-evidence"],
      },
      {
        id: "owner-classification-review",
        title: "Review manager findings",
        summary: "Approve completed findings or return them for further investigation.",
        page: "shrinkage",
        roles: ["OWNER"],
        steps: [
          "Open a case awaiting Owner review.",
          "Review the variance, manager findings, classification, and linked evidence.",
          "Mark the findings as reviewed when they are complete, or return them with a clear reason.",
          "Confirm the final status and reviewer details.",
        ],
        tips: ["Reviewing a case does not change sales, COGS, recipes, or the submitted physical count."],
        related: ["review-variance", "monitor-incidents"],
      },
    ],
  },
  {
    id: "predictive",
    title: "Predictive Analytics",
    description: "Interpret forecasts, confidence, stock risk, and recommendations.",
    topics: [
      {
        id: "read-forecast",
        title: "Read the sales forecast",
        summary: "Understand forecast totals, demand change, confidence, and evaluation results.",
        page: "predictive",
        steps: [
          "Choose the permitted branch and forecast period.",
          "Review forecast sales and demand change alongside the historical baseline.",
          "Check confidence, evaluated days, and MAE before relying on the forecast for planning.",
          "When history is limited, use the forecast as an early planning guide rather than a validated prediction.",
        ],
        related: ["read-stock-risk", "view-reports"],
      },
      {
        id: "read-stock-risk",
        title: "Review stock risk and recommendations",
        summary: "Use projected stock-out timing and reorder suggestions as planning support.",
        page: "predictive",
        steps: [
          "Review the projected inventory series for the chosen branch.",
          "Prioritize ingredients with the shortest estimated time to stock-out.",
          "Compare suggested quantities with supplier, storage, and operational constraints.",
          "Use the generated written insights as guidance; numerical results remain the system-calculated authority.",
        ],
        related: ["read-forecast", "stock-statuses", "monitor-purchase-orders"],
      },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    description: "Filter, review, and export authorized business reports.",
    topics: [
      {
        id: "view-reports",
        title: "Review and export reports",
        summary: "Create a report view for the selected branch and period.",
        page: "reports",
        steps: [
          "Choose a report type, permitted branch, and reporting period.",
          "Apply filters and review the summary before exporting.",
          "Check detailed rows for exceptions or missing information.",
          "Export only the report needed for the intended business purpose.",
        ],
        related: ["review-sales-cogs", "inventory-overview", "read-forecast"],
      },
    ],
  },
  {
    id: "staff-monitoring",
    title: "Staff Monitoring",
    description: "Submit or review operational incidents according to your role.",
    topics: [
      {
        id: "submit-incident",
        title: "Submit a staff incident report",
        summary: "Record one incident with one or more affected inventory items.",
        page: "dashboard",
        roles: ["STAFF"],
        steps: [
          "Open Record an Incident from the Staff Portal.",
          "Choose the incident type and optional related product variant.",
          "Add each affected ingredient with its quantity and unit.",
          "Enter the date, time, description, and optional photo evidence.",
          "Review the information and submit the report for manager review.",
        ],
        tips: ["An incident report is supporting evidence and does not directly change stock or COGS."],
        related: ["staff-quick-start", "personal-settings"],
      },
      {
        id: "review-incident-evidence",
        title: "Review incident evidence",
        summary: "Verify a branch incident and use it as supporting evidence where relevant.",
        page: "staff-monitoring",
        roles: ["BRANCH_MANAGER"],
        steps: [
          "Open the pending incident for your assigned branch.",
          "Review the type, affected items, quantities, description, and photo evidence.",
          "Verify or reject the report based on the available information.",
          "Link verified evidence to a related discrepancy investigation when appropriate.",
        ],
        related: ["manager-investigation", "review-variance"],
      },
      {
        id: "monitor-incidents",
        title: "Monitor staff incidents",
        summary: "Review incident status and evidence across authorized branches.",
        page: "staff-monitoring",
        roles: ["OWNER"],
        steps: [
          "Filter incidents by branch, date, type, or status.",
          "Open a report to review its affected items and evidence.",
          "Use linked evidence when reviewing a manager's classification.",
          "Archive only when the incident no longer needs to appear in the active log.",
        ],
        related: ["owner-classification-review", "view-reports"],
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    description: "Manage your account, security, notifications, and permitted administration.",
    topics: [
      {
        id: "personal-settings",
        title: "Profile, security, and preferences",
        summary: "Maintain your own account and display preferences.",
        page: "settings",
        steps: [
          "Open Settings and choose Profile to review your account information.",
          "Use Password & Security to change your password securely.",
          "Choose which permitted notifications you want to receive.",
          "Adjust your theme and interface preferences, then save your changes.",
        ],
        related: ["help-guide"],
      },
      {
        id: "owner-business-settings",
        title: "Business Information",
        summary: "Maintain organization details and the reporting cycle.",
        page: "settings",
        roles: ["OWNER"],
        steps: [
          "Open Settings and choose Business Information.",
          "Review the organization identity and contact details.",
          "Choose the approved reporting cycle.",
          "Save and confirm the business settings change.",
        ],
        related: ["owner-dashboard", "owner-administration"],
      },
      {
        id: "owner-administration",
        title: "Users and branches",
        summary: "Use the dedicated Owner modules to administer access and branch records.",
        page: "users",
        roles: ["OWNER"],
        steps: [
          "Open User Management to review user roles, status, and branch assignment.",
          "Open Branch Management to review branch information and status.",
          "Make only approved changes and confirm their effect before saving.",
          "Return to Dashboard to confirm the intended branch visibility.",
        ],
        related: ["owner-business-settings", "owner-dashboard"],
      },
      {
        id: "help-guide",
        title: "Use Help & User Guide",
        summary: "Find instructions without exposing actions unavailable to your role.",
        page: "settings",
        steps: [
          "Search by a task, page name, or business term.",
          "Open a category to browse its available topics.",
          "Choose a topic for step-by-step guidance.",
          "Use related guides to continue to the next permitted task.",
        ],
        related: ["personal-settings"],
      },
    ],
  },
];

const sectionIcons: Record<string, ElementType> = {
  "quick-start": BookOpen,
  dashboard: LayoutDashboard,
  "cogs-sales": BarChart3,
  "menu-recipes": UtensilsCrossed,
  inventory: Package,
  "purchase-orders": ShoppingCart,
  variance: Gauge,
  "classification-review": ShieldCheck,
  predictive: TrendingUp,
  reports: FileBarChart,
  "staff-monitoring": UsersRound,
  settings: Settings,
};

function topicAllowed(topic: HelpTopic, role: UserRole) {
  return isPageAllowed(topic.page, role) && (!topic.roles || topic.roles.includes(role));
}

export function getAuthorizedHelpSections(role: UserRole): HelpSection[] {
  return helpSections
    .map((section) => ({
      ...section,
      topics: section.topics.filter((topic) => topicAllowed(topic, role)),
    }))
    .filter((section) => section.topics.length > 0);
}

export function searchAuthorizedHelp(role: UserRole, query: string): HelpSection[] {
  const authorized = getAuthorizedHelpSections(role);
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return authorized;
  return authorized
    .map((section) => ({
      ...section,
      topics: section.topics.filter((topic) =>
        [section.title, section.description, topic.title, topic.summary, ...topic.steps, ...(topic.tips ?? []), ...(topic.keywords ?? [])]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalized),
      ),
    }))
    .filter((section) => section.topics.length > 0);
}

export function HelpBackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--app-primary)] hover:underline">
      <ArrowLeft size={16} /> Back to Help
    </button>
  );
}

export function HelpGuide({ role }: { role: UserRole }) {
  const [query, setQuery] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const authorized = useMemo(() => getAuthorizedHelpSections(role), [role]);
  const visibleSections = useMemo(() => searchAuthorizedHelp(role, query), [role, query]);
  const selected = authorized
    .flatMap((section) => section.topics.map((topic) => ({ section, topic })))
    .find(({ topic }) => topic.id === selectedTopicId);

  if (selected) {
    const related = (selected.topic.related ?? [])
      .map((id) => authorized.flatMap((section) => section.topics.map((topic) => ({ section, topic }))).find(({ topic }) => topic.id === id))
      .filter((item): item is { section: HelpSection; topic: HelpTopic } => Boolean(item));
    return (
      <section className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6">
        <HelpBackButton onBack={() => setSelectedTopicId(null)} />
        <nav aria-label="Help breadcrumb" className="mt-5 text-xs text-[var(--app-text-muted)]">
          Help & User Guide <span className="px-1">/</span> {selected.section.title} <span className="px-1">/</span> {selected.topic.title}
        </nav>
        <h2 className="mt-3 text-xl font-bold text-[var(--app-text)]">{selected.topic.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">{selected.topic.summary}</p>
        <div className="mt-6 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4 sm:p-5">
          <h3 className="font-semibold text-[var(--app-text)]">Step-by-step</h3>
          <ol className="mt-3 space-y-3">
            {selected.topic.steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-6 text-[var(--app-text-muted)]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--app-primary)] text-xs font-bold text-white">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
        {selected.topic.tips?.length ? (
          <div className="mt-4 rounded-2xl border border-[var(--app-primary)]/20 bg-[var(--app-primary-subtle)] p-4">
            <h3 className="text-sm font-semibold text-[var(--app-text)]">Good to know</h3>
            {selected.topic.tips.map((tip) => <p key={tip} className="mt-1 text-sm leading-6 text-[var(--app-text-muted)]">{tip}</p>)}
          </div>
        ) : null}
        {related.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-[var(--app-text)]">Related guides</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {related.map(({ section, topic }) => (
                <button key={topic.id} type="button" onClick={() => setSelectedTopicId(topic.id)} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-left transition-colors hover:border-[var(--app-primary)]">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--app-text-faint)]">{section.title}</span>
                  <span className="mt-1 block text-sm font-semibold text-[var(--app-text)]">{topic.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--app-primary-subtle)] text-[var(--app-primary)]"><BookOpen size={19} /></div>
        <div>
          <h2 className="font-semibold text-[var(--app-text)]">Help & User Guide</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--app-text-muted)]">Find role-appropriate guidance for Libro Espresso workflows.</p>
        </div>
      </div>
      <label className="relative mt-5 block">
        <span className="sr-only">Search help topics</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)]" size={17} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help topics" className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] py-2.5 pl-10 pr-3 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-primary)] focus:ring-4 focus:ring-[var(--app-primary-faint)]" />
      </label>
      <div className="mt-5 space-y-3">
        {visibleSections.map((section) => {
          const Icon = sectionIcons[section.id] ?? ClipboardCheck;
          return (
            <details key={section.id} open={Boolean(query.trim())} className="group rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)]">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--app-surface-muted)] text-[var(--app-primary)]"><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[var(--app-text)]">{section.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--app-text-muted)]">{section.description}</span>
                </span>
                <ChevronDown size={17} className="shrink-0 text-[var(--app-text-faint)] transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-2 border-t border-[var(--app-border)] p-3 sm:grid-cols-2 sm:p-4">
                {section.topics.map((topic) => (
                  <button key={topic.id} type="button" onClick={() => setSelectedTopicId(topic.id)} className="rounded-xl p-3 text-left transition-colors hover:bg-[var(--app-surface-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--app-primary)]">
                    <span className="block text-sm font-semibold text-[var(--app-text)]">{topic.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--app-text-muted)]">{topic.summary}</span>
                  </button>
                ))}
              </div>
            </details>
          );
        })}
        {visibleSections.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--app-border)] p-8 text-center">
            <p className="font-semibold text-[var(--app-text)]">No help topics found</p>
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">Try a different task or page name.</p>
          </div>
        )}
      </div>
    </section>
  );
}
