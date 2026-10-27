"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS } from "@/lib/use-pagination";

const TEXT_COLOR = "#1f2937";

const navButtonClass =
  "px-3 py-1.5 text-sm font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 hover:border-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Disables Previous/Next, e.g. while a page is loading */
  disabled?: boolean;
  primaryColor?: string;
}

/** "Showing X–Y of Z" + rows-per-page dropdown + Previous/Next. Hidden when there are no rows. */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  primaryColor = "#ea580c",
}: PaginationProps) {
  if (total === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
      <div className="flex flex-col sm:flex-row items-center gap-3 text-sm text-gray-600">
        <span>
          Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
        </span>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
            <SelectTrigger className="w-20 h-8" style={{ color: TEXT_COLOR }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              style={
                {
                  "--select-hover-bg": `${primaryColor}20`,
                  "--select-hover-text": TEXT_COLOR,
                } as React.CSSProperties
              }
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1 || disabled}
          className={navButtonClass}
        >
          Previous
        </button>
        <span className="px-3 py-1.5 text-sm text-gray-600">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages || disabled}
          className={navButtonClass}
        >
          Next
        </button>
      </div>
    </div>
  );
}
