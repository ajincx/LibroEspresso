import { describe, expect, it } from "vitest";
import { manilaBusinessDate } from "./businessTime.service.js";

describe("Philippine business dates", () => {
  it("keeps dates stable immediately before and after Manila midnight", () => {
    expect(manilaBusinessDate(new Date("2026-09-09T15:30:00.000Z"))).toBe("2026-09-09");
    expect(manilaBusinessDate(new Date("2026-09-09T16:30:00.000Z"))).toBe("2026-09-10");
  });
});
