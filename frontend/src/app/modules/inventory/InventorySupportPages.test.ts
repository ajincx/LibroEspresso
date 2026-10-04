import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canRecordPhysicalCount, inventoryCountHistoryActions, inventoryCountHistoryModes, PhysicalCountHistoryHeaderActions } from "./InventorySupportPages";

describe("inventory-count history role actions", () => {
  it("keeps Owner history read-only while exposing count details", () => {
    expect(inventoryCountHistoryActions("owner", true)).toEqual({ canView: true, canEdit: false, canDelete: false });
  });

  it("shows correction only when the server authorizes the Branch Manager", () => {
    expect(inventoryCountHistoryActions("manager", true)).toEqual({ canView: false, canEdit: true, canDelete: false });
    expect(inventoryCountHistoryActions("manager", false)).toEqual({ canView: false, canEdit: false, canDelete: false });
  });

  it("shows the separate UAT/Test history only to the Owner when the backend enables it", () => {
    expect(inventoryCountHistoryModes("owner", true)).toEqual(["operational", "uat"]);
    expect(inventoryCountHistoryModes("owner", false)).toEqual(["operational"]);
    expect(inventoryCountHistoryModes("manager", true)).toEqual(["operational"]);
  });

  it("shows Record Stock Count only to the role authorized to create physical counts", () => {
    expect(canRecordPhysicalCount("manager")).toBe(true);
    expect(canRecordPhysicalCount("owner")).toBe(false);
    const managerMarkup = renderToStaticMarkup(React.createElement(PhysicalCountHistoryHeaderActions, { role: "manager", historyMode: "operational", onRecordCount: () => undefined, onRefresh: () => undefined }));
    const ownerMarkup = renderToStaticMarkup(React.createElement(PhysicalCountHistoryHeaderActions, { role: "owner", historyMode: "operational", onRecordCount: () => undefined, onRefresh: () => undefined }));
    expect(managerMarkup).toContain("Record Stock Count");
    expect(ownerMarkup).not.toContain("Record Stock Count");
    expect(ownerMarkup).toContain("Refresh");
  });

  it("forwards Record Stock Count to the existing entry-flow callback", () => {
    const onRecordCount = vi.fn();
    const actions = PhysicalCountHistoryHeaderActions({ role: "manager", historyMode: "operational", onRecordCount, onRefresh: () => undefined }) as React.ReactElement<{ children: React.ReactNode }>;
    const recordButton = React.Children.toArray(actions.props.children).find(React.isValidElement) as React.ReactElement<{ onClick?: () => void }>;
    recordButton.props.onClick?.();
    expect(onRecordCount).toHaveBeenCalledOnce();
  });
});
