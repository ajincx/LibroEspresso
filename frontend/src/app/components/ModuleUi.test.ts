import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Btn, clampTablePage, filterSelectOptions, isModalBackdropEvent, isTableDataValue, moveSelectActiveIndex, normalizeSelectOptions, paginationPageNumbers, selectFilteredOption, sharedSelectMenuStyle, sharedSelectPopoverProps, TableWrapper, tableRowsSignature, THead, TR, TD, tableHeaderAlignment } from "./ModuleUi";

describe("shared table alignment",()=>{
  it("centers numeric headers and values",()=>{
    expect(tableHeaderAlignment("Total Sales")).toBe("center");
    expect(tableHeaderAlignment("Quantity")).toBe("center");
    expect(isTableDataValue(12)).toBe(true);
    expect(isTableDataValue("₱1,250.00")).toBe(true);
  });
  it("centers descriptive columns, dates, and statuses",()=>{
    expect(tableHeaderAlignment("Ingredient")).toBe("center");
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

describe("shared modal backdrop behavior",()=>{
  it("closes only for the backdrop, not a click inside dialog content",()=>{
    const backdrop={};
    expect(isModalBackdropEvent({target:backdrop,currentTarget:backdrop} as never)).toBe(true);
    expect(isModalBackdropEvent({target:{},currentTarget:backdrop} as never)).toBe(false);
  });
});

describe("shared table pagination",()=>{
  it("shows only ten data rows on the initial page and exposes page navigation",()=>{
    const rows=Array.from({length:25},(_,index)=>React.createElement(TR,{key:index,children:React.createElement(TD,null,`Record ${index+1}`)}));
    const markup=renderToStaticMarkup(React.createElement(TableWrapper,null,React.createElement(THead,{cols:["Record"]}),React.createElement("tbody",null,rows)));
    expect(markup).toContain("Record 1");
    expect(markup).toContain("Record 10");
    expect(markup).not.toContain("Record 11");
    expect(markup).toContain("Previous page");
    expect(markup).toContain("Next page");
    expect(paginationPageNumbers(6,10)).toEqual([4,5,6,7,8]);
  });
  it("detects filtered row changes and clamps a now-invalid current page",()=>{
    const all=Array.from({length:21},(_,index)=>React.createElement("tr",{key:`row-${index}`}));
    const filtered=all.slice(0,4);
    expect(tableRowsSignature(all)).not.toBe(tableRowsSignature(filtered));
    expect(clampTablePage(3,filtered.length,10)).toBe(1);
  });
});

describe("shared select viewport behavior",()=>{
  it("uses collision-aware positioning so a bottom-edge dropdown can open upward",()=>{
    expect(sharedSelectPopoverProps.side).toBe("bottom");
    expect(sharedSelectPopoverProps.avoidCollisions).toBe(true);
    expect(sharedSelectPopoverProps.collisionPadding).toBeGreaterThan(0);
  });

  it("limits long option lists to available viewport space and scrolls them independently",()=>{
    expect(sharedSelectMenuStyle.maxHeight).toContain("--radix-popover-content-available-height");
    expect(sharedSelectMenuStyle.overflowY).toBe("auto");
    expect(sharedSelectMenuStyle.overscrollBehavior).toBe("contain");
  });

  it("sizes the portalled menu from its trigger instead of a clipping parent",()=>{
    expect(sharedSelectMenuStyle.width).toBe("var(--radix-popover-trigger-width)");
    expect(sharedSelectMenuStyle.maxWidth).toContain("100vw");
  });

  it("keeps modal dropdown positioning anchored while its container scrolls",()=>{
    expect(sharedSelectPopoverProps.sticky).toBe("always");
    expect(sharedSelectPopoverProps.align).toBe("start");
  });
});

describe("shared searchable select",()=>{
  const options=[
    {value:"beans-id",label:"Espresso Blend Beans (RM-002)"},
    {value:"milk-id",label:"Whole Milk (RM-005)"},
    {value:"salt-id",label:"Salt (ING-00010)"},
  ];

  it("filters supplied options immediately from typed text",()=>{
    expect(filterSelectOptions(options,"milk")).toEqual([options[1]]);
    expect(filterSelectOptions(options,"  RM-002 ")).toEqual([options[0]]);
  });

  it("selects the existing value represented by a filtered option",()=>{
    expect(selectFilteredOption(options,"salt",0)).toBe("salt-id");
  });

  it("returns an empty result set for an unmatched query",()=>{
    expect(filterSelectOptions(options,"oat milk")).toEqual([]);
  });

  it("supports wrapping keyboard navigation and Enter resolution",()=>{
    expect(moveSelectActiveIndex(-1,options.length,1)).toBe(0);
    expect(moveSelectActiveIndex(0,options.length,-1)).toBe(2);
    expect(selectFilteredOption(options,"",2)).toBe("salt-id");
  });

  it("keeps an existing selected value in the supplied option model",()=>{
    expect(normalizeSelectOptions(options).find((option)=>option.value==="milk-id")?.label).toBe("Whole Milk (RM-005)");
  });

  it("cannot turn unmatched typed text into a new record value",()=>{
    expect(selectFilteredOption(options,"TEST_New Ingredient",0)).toBeUndefined();
  });
});
