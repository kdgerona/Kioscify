// Opt-in pagination for list endpoints.
//
// List endpoints keep returning a plain array when no `page` is passed, because
// the dashboard, analytics and the mobile app still read the full list. Only
// callers that pass `page` get the `{ data, pagination }` envelope.

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * Turns raw `page`/`limit` query values into pagination params, or undefined
 * when the caller did not ask for a page. Bad or out-of-range values fall back
 * to page 1 / the default size rather than erroring.
 */
export function toPagination(
  page?: string | number,
  limit?: string | number,
): PaginationParams | undefined {
  if (page === undefined || page === null || page === '') return undefined;
  const parsedPage = Number(page);
  const parsedLimit = Number(limit);
  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    limit:
      Number.isInteger(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE,
  };
}

/** Prisma `skip`/`take` for a page, or nothing when unpaginated. */
export function pageArgs(pagination?: PaginationParams): { skip?: number; take?: number } {
  return pagination
    ? { skip: (pagination.page - 1) * pagination.limit, take: pagination.limit }
    : {};
}

export function toPaginated<T>(
  data: T[],
  total: number,
  { page, limit }: PaginationParams,
): Paginated<T> {
  return {
    data,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
