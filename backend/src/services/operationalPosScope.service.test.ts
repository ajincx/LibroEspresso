import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_POS_IMPORT_CONDITION,
  OPERATIONAL_POS_SOURCE_JOIN,
} from "./operationalPosScope.service.js";

describe("operational POS SQL scope", () => {
  it("keeps accepted historical imports eligible after their source is deactivated", () => {
    expect(OPERATIONAL_POS_SOURCE_JOIN).toBe("JOIN pos_sources source ON source.id=pi.pos_source_id");
    expect(OPERATIONAL_POS_SOURCE_JOIN).not.toContain("source.status");
    expect(OPERATIONAL_POS_IMPORT_CONDITION).toBe("NOT pi.is_test_data");
  });
});
