import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ControlledActionDialog } from "./ControlledActionDialog";

const base = {
  title: "Confirm protected action",
  description: "The server verifies this action.",
  confirmLabel: "Confirm",
  busy: false,
  onChange: vi.fn(),
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
};

describe("ControlledActionDialog current-password reauthentication", () => {
  it("requests the authenticated user's current password and blocks incomplete confirmation", () => {
    const markup = renderToStaticMarkup(<ControlledActionDialog {...base} value={{ reason: "Valid audit reason", currentPassword: "" }} />);
    expect(markup).toContain("Current password");
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).not.toContain("Verification PIN");
    expect(markup).toContain('disabled=""');
  });

  it("enables confirmation when reason and current password are present", () => {
    const markup = renderToStaticMarkup(<ControlledActionDialog {...base} value={{ reason: "Valid audit reason", currentPassword: "correct password" }} />);
    expect(markup).not.toContain('disabled=""');
  });

  it("preserves deliberately reason-only protected operations", () => {
    const markup = renderToStaticMarkup(<ControlledActionDialog {...base} requireCurrentPassword={false} minReasonLength={1} value={{ reason: "Correction", currentPassword: "" }} />);
    expect(markup).not.toContain("Current password");
    expect(markup).not.toContain('disabled=""');
  });
});
