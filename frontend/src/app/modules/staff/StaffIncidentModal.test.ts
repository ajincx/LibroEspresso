import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { nextOtherIncidentType, OtherIncidentTypeField, validateOtherIncidentType } from "./StaffIncidentModal";

describe("Staff incident Other specification", () => {
  it("requires a non-whitespace specification only for OTHER", () => {
    expect(validateOtherIncidentType("OTHER", "")).toBe("Please specify the incident type.");
    expect(validateOtherIncidentType("OTHER", "   ")).toBe("Please specify the incident type.");
    expect(validateOtherIncidentType("OTHER", "Packaging issue")).toBe("");
    expect(validateOtherIncidentType("SPOILAGE", "")).toBe("");
  });

  it("clears a stale specification when a standard category is selected", () => {
    expect(nextOtherIncidentType("WASTAGE", "Packaging issue")).toBe("");
    expect(nextOtherIncidentType("OTHER", "Packaging issue")).toBe("Packaging issue");
  });

  it("shows the specification field only when OTHER is selected", () => {
    const hidden = renderToStaticMarkup(React.createElement(OtherIncidentTypeField,{type:"WASTAGE",value:"",error:"",onChange:()=>undefined}));
    const visible = renderToStaticMarkup(React.createElement(OtherIncidentTypeField,{type:"OTHER",value:"Packaging issue",error:"",onChange:()=>undefined}));
    expect(hidden).toBe("");
    expect(visible).toContain("Specify incident type");
    expect(visible).toContain("Packaging issue");
    expect(visible).toContain('maxLength="120"');
  });
});
