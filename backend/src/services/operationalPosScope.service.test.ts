import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_POS_IMPORT_CONDITION,
  OPERATIONAL_POS_SOURCE_JOIN,
} from "./operationalPosScope.service.js";

describe("operational POS SQL scope", () => {
  it("requires an active source and a non-test import", () => {
    expect(OPERATIONAL_POS_SOURCE_JOIN).toContain("source.status='ACTIVE'");
    expect(OPERATIONAL_POS_IMPORT_CONDITION).toBe("NOT pi.is_test_data");
  });
});
