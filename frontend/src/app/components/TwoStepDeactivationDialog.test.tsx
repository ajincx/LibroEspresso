import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { TwoStepDeactivationDialog } from "./TwoStepDeactivationDialog";

const label = (node: ReactTestInstance) => node.children.filter((child): child is string => typeof child === "string").join("");

describe("two-step deactivation dialog", () => {
  it("requires initial confirmation and one approved reason before deactivation", () => {
    const confirm = vi.fn();
    const renderer = create(createElement(TwoStepDeactivationDialog, {
      message: "Are you sure you want to deactivate this account?",
      reasons: ["Employee resigned.", "Other."],
      busy: false,
      onCancel: vi.fn(),
      onConfirm: confirm,
    }));
    const proceed = renderer.root.findAllByType("button").find((button) => label(button) === "Proceed")!;
    act(() => proceed.props.onClick());
    const deactivate = renderer.root.findAllByType("button").find((button) => label(button) === "Deactivate")!;
    expect(deactivate.props.disabled).toBe(true);
    const reason = renderer.root.findAllByType("button").find((button) => label(button) === "Employee resigned.")!;
    act(() => reason.props.onClick());
    expect(renderer.root.findAllByType("button").find((button) => label(button) === "Deactivate")!.props.disabled).toBe(false);
    act(() => renderer.root.findAllByType("button").find((button) => label(button) === "Deactivate")!.props.onClick());
    expect(confirm).toHaveBeenCalledWith("Employee resigned.");
  });
});
