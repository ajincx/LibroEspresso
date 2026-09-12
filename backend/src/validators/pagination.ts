import { z } from "zod";

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(100),
});

export type PaginationInput = z.infer<typeof paginationQuery>;

export function paginationSql(input: PaginationInput, parameterOffset: number) {
  return { limitPlaceholder: `$${parameterOffset + 1}`, offsetPlaceholder: `$${parameterOffset + 2}`, values: [input.pageSize, (input.page - 1) * input.pageSize] };
}

export function paginatedRows<T extends Record<string, unknown>>(rows: T[], input: PaginationInput) {
  const total = Number(rows[0]?.__total ?? 0);
  const data = rows.map(({ __total: _total, ...row }) => row as Omit<T, "__total">);
  return { data, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.max(1, Math.ceil(total / input.pageSize)) } };
}
