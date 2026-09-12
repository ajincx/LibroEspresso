import { describe, expect, it } from "vitest";
import { managerNav, ownerNav } from "./AppChrome";

describe("approved management navigation", () => {
  it("does not expose a standalone Management Analytics item", () => {
    const entries = [...ownerNav, ...managerNav].flatMap((item) => [
      item,
      ...("children" in item && item.children ? item.children : []),
    ]);

    expect(entries.some((item) => item.id === "analytics")).toBe(false);
    expect(entries.some((item) => item.label === "Management Analytics")).toBe(false);
  });
});
