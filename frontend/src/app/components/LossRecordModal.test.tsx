import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LossRecordModal, lossRecordDateError } from "./LossRecordModal";

describe("alternate incident Manila date handling", () => {
  it("rejects impossible and future values while accepting the current time", () => {
    const now = new Date("2026-10-22T16:30:00.000Z");
    expect(lossRecordDateError("2026-02-30T08:00", now)).toBe("Incident date and time is invalid.");
    expect(lossRecordDateError("2026-10-23T00:31", now)).toBe("Incident date and time cannot be in the future.");
    expect(lossRecordDateError("2026-10-23T00:30", now)).toBe("");
  });

  it("renders the shared maximum on the alternate incident form", () => {
    const markup = renderToStaticMarkup(React.createElement(LossRecordModal, {
      items: [],
      onClose: () => undefined,
      onSaved: () => undefined,
    }));
    expect(markup).toContain('max="');
    expect(markup).toContain("Record Loss / Incident");
  });
});
