import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarDateField, DashboardFilters, Select } from "./ModuleUi";
import { readDashboardUserRange, saveDashboardUserRange } from "../modules/dashboard/DashboardPage";
import { readCogsUserRange } from "../modules/cogs/CogsSalesModule";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
});

const text = (node: ReactTestInstance): string => node.children
  .map((child) => typeof child === "string" ? child : text(child))
  .join("");

describe("shared reporting date filter", () => {
  beforeEach(() => values.clear());

  it("keeps the applied period unchanged until Set, then shows the summary and Reset", () => {
    const onRangeChange = vi.fn();
    const onApplyCustom = vi.fn();
    const onReset = vi.fn();
    const props = {
      range: "7d" as const,
      comparison: "previous" as const,
      customStart: "2026-10-21",
      customEnd: "2026-10-27",
      onRangeChange,
      onComparisonChange: vi.fn(),
      onApplyCustom,
      onReset,
    };
    const renderer = create(createElement(DashboardFilters, props));
    const rangeSelect = renderer.root.findAllByType(Select)
      .find((select) => select.props.ariaLabel === "Reporting date range")!;
    expect(rangeSelect.props.options.map((option: { label: string }) => option.label)).toEqual([
      "Today", "Last 7 Days", "Last 30 Days", "Month to Date", "Custom Range",
    ]);

    act(() => rangeSelect.props.onChange("custom"));
    expect(onRangeChange).not.toHaveBeenCalled();
    const fields = renderer.root.findAllByType(CalendarDateField);
    expect(fields.map((field) => field.props.label)).toEqual(["Start date", "End date"]);
    act(() => fields[0]!.props.onChange("2026-09-06"));
    act(() => renderer.root.findAllByType(CalendarDateField)[1]!.props.onChange("2026-10-25"));
    const set = renderer.root.findAllByType("button").find((button) => text(button) === "Set")!;
    expect(set.props.disabled).toBe(false);
    act(() => set.props.onClick());
    expect(onApplyCustom).toHaveBeenCalledWith("2026-09-06", "2026-10-25");

    act(() => renderer.update(createElement(DashboardFilters, {
      ...props,
      range: "custom",
      customStart: "2026-09-06",
      customEnd: "2026-10-25",
      customApplied: true,
    })));
    expect(renderer.root.findAllByType(CalendarDateField)).toHaveLength(0);
    expect(renderer.root.findAllByType(Select).some((select) => select.props.ariaLabel === "Reporting date range")).toBe(false);
    expect(text(renderer.root)).toContain("September 6, 2026 – October 25, 2026");
    const reset = renderer.root.findAllByType("button").find((button) => text(button) === "Reset")!;
    act(() => reset.props.onClick());
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("shares an applied custom period between Dashboard, COGS, and POS Sales", () => {
    saveDashboardUserRange({ range: "custom", customStart: "2026-09-06", customEnd: "2026-10-25" });
    expect(readDashboardUserRange()).toEqual({ range: "custom", customStart: "2026-09-06", customEnd: "2026-10-25" });
    expect(readCogsUserRange()).toEqual({ range: "custom", customStart: "2026-09-06", customEnd: "2026-10-25" });
  });
});
