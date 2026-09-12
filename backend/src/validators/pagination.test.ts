import { describe, expect, it } from "vitest";
import { paginatedRows, paginationQuery, paginationSql } from "./pagination.js";

describe("pagination", () => {
  it("uses deterministic defaults and bounded page sizes", () => {
    expect(paginationQuery.parse({})).toEqual({ page: 1, pageSize: 100 });
    expect(paginationQuery.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it("calculates page boundaries and totals", () => {
    const input = paginationQuery.parse({ page: 3, pageSize: 10 });
    expect(paginationSql(input, 2)).toEqual({ limitPlaceholder: "$3", offsetPlaceholder: "$4", values: [10, 20] });
    expect(paginatedRows([{ id: "row", __total: 21 }], input)).toEqual({ data: [{ id: "row" }], pagination: { page: 3, pageSize: 10, total: 21, totalPages: 3 } });
  });

  it("returns safe metadata for an empty page", () => {
    const input = paginationQuery.parse({ page: 2, pageSize: 10 });
    expect(paginatedRows([], input)).toEqual({ data: [], pagination: { page: 2, pageSize: 10, total: 0, totalPages: 1 } });
  });
});
