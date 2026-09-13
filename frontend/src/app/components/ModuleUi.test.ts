import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Btn, isTableDataValue, tableHeaderAlignment } from "./ModuleUi";

describe("shared table alignment",()=>{
  it("centers numeric headers and values",()=>{
    expect(tableHeaderAlignment("Total Sales")).toBe("center");
    expect(tableHeaderAlignment("Quantity")).toBe("center");
    expect(isTableDataValue(12)).toBe(true);
    expect(isTableDataValue("₱1,250.00")).toBe(true);
  });
  it("keeps descriptive columns left aligned and centers dates and statuses",()=>{
    expect(tableHeaderAlignment("Ingredient")).toBe("left");
    expect(tableHeaderAlignment("Status")).toBe("center");
    expect(tableHeaderAlignment("Business Date")).toBe("center");
    expect(isTableDataValue("Arabica Beans")).toBe(false);
    expect(isTableDataValue("09/12/2026")).toBe(true);
  });
});

describe("shared button accessibility",()=>{
  it("provides a consistent visible keyboard focus treatment",()=>{
    const markup=renderToStaticMarkup(React.createElement(Btn,null,"Save"));
    expect(markup).toContain("focus-visible:ring-2");
    expect(markup).toContain("focus-visible:ring-[var(--app-primary)]");
  });
});
