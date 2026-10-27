import { pageArgs, toPaginated, toPagination } from './pagination';

describe('toPagination', () => {
  it('is undefined when no page is requested, so the endpoint stays unpaginated', () => {
    expect(toPagination(undefined, '10')).toBeUndefined();
    expect(toPagination('', '10')).toBeUndefined();
  });

  it('parses query-string values', () => {
    expect(toPagination('3', '25')).toEqual({ page: 3, limit: 25 });
  });

  it('falls back to page 1 and the default size for bad values', () => {
    expect(toPagination('abc', 'xyz')).toEqual({ page: 1, limit: 50 });
    expect(toPagination('0', '-5')).toEqual({ page: 1, limit: 50 });
  });

  it('caps the page size', () => {
    expect(toPagination(1, 10_000)).toEqual({ page: 1, limit: 200 });
  });
});

describe('pageArgs', () => {
  it('maps a page to skip/take', () => {
    expect(pageArgs({ page: 3, limit: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it('adds nothing when unpaginated', () => {
    expect(pageArgs(undefined)).toEqual({});
  });
});

describe('toPaginated', () => {
  it('reports at least one page when empty', () => {
    expect(toPaginated([], 0, { page: 1, limit: 10 }).pagination.totalPages).toBe(1);
  });

  it('rounds total pages up', () => {
    expect(toPaginated([], 21, { page: 1, limit: 10 }).pagination).toEqual({
      page: 1,
      limit: 10,
      total: 21,
      totalPages: 3,
    });
  });
});
