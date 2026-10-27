import { useCallback, useMemo, useRef, useState } from "react";
import type { Paginated } from "@/types";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_PAGE_SIZE = 10;

/**
 * Page state for a list paginated by the API.
 *
 * `resetKey` should change whenever the filters change (e.g. JSON.stringify of
 * them). The reset to page 1 happens during render, so the page's fetch effect
 * only ever sees the new filters with page 1, and fetches once.
 */
export function usePagination(resetKey: string, initialPageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setPage(1);
  }

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const applyResult = useCallback((pagination: Paginated<unknown>["pagination"]) => {
    setTotal(pagination.total);
    setTotalPages(pagination.totalPages);
    // e.g. approving the last row on the last page leaves that page empty
    setPage((current) => Math.min(current, pagination.totalPages));
  }, []);

  // Lets a page drop a slow response that a newer request has superseded:
  // `const isLatest = beginRequest(); ... if (!isLatest()) return;`
  const latestRequest = useRef(0);
  const beginRequest = useCallback(() => {
    const id = ++latestRequest.current;
    return () => id === latestRequest.current;
  }, []);

  return { page, setPage, pageSize, setPageSize, total, totalPages, applyResult, beginRequest };
}

/** Page state for a short list that is already fully loaded in the browser. */
export function useLocalPagination<T>(items: T[], initialPageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Clamp so removing the last row on the last page doesn't leave an empty page
  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize]
  );

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  return { page: currentPage, setPage, pageSize, setPageSize, total, totalPages, pageItems };
}
