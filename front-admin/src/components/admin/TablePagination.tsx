"use client";

import { useEffect, useState } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";

export const TABLE_PAGE_SIZE = 25;

export function pageCount(total: number, pageSize = TABLE_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

export function slicePage<T>(
  items: T[],
  page: number,
  pageSize = TABLE_PAGE_SIZE,
): T[] {
  const start = (Math.max(1, page) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/** Reseta para página 1 quando filtros mudam. */
export function useTablePage(resetKey: string | number) {
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [resetKey]);
  return [page, setPage] as const;
}

function visiblePages(page: number, totalPages: number): Array<number | "…"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const set = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  if (page <= 3) {
    set.add(2);
    set.add(3);
    set.add(4);
  }
  if (page >= totalPages - 2) {
    set.add(totalPages - 1);
    set.add(totalPages - 2);
    set.add(totalPages - 3);
  }
  const sorted = [...set]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) out.push("…");
    out.push(sorted[i]!);
  }
  return out;
}

const pageBtn =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-2 text-[13px] font-medium text-[var(--ds-color-foreground)] hover:bg-[var(--ds-color-muted)]";
const pageBtnActive =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-[var(--ds-color-foreground)] bg-[var(--ds-color-muted)] px-2 text-[13px] font-semibold";
const pageBtnGhost =
  "inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-[var(--ds-color-foreground)] hover:bg-[var(--ds-color-muted)] disabled:pointer-events-none disabled:opacity-40";

export function TablePagination({
  page,
  total,
  pageSize = TABLE_PAGE_SIZE,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= 0) return null;

  const totalPages = pageCount(total, pageSize);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pages = visiblePages(safePage, totalPages);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);
  const multi = totalPages > 1;

  return (
    <div className="flex flex-col items-center gap-2 border-t border-[var(--ds-color-border)] px-4 py-3 sm:flex-row sm:justify-between">
      <p className="text-[12px] text-[var(--ds-color-muted-foreground)]">
        {from}–{to} de {total}
      </p>
      {multi ? (
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <button
                type="button"
                className={pageBtnGhost}
                disabled={safePage <= 1}
                onClick={() => onPageChange(safePage - 1)}
              >
                ← Anterior
              </button>
            </PaginationItem>
            {pages.map((p, i) =>
              p === "…" ? (
                <PaginationItem key={`e-${i}`}>
                  <PaginationEllipsis className="text-[var(--ds-color-muted-foreground)]" />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <button
                    type="button"
                    className={p === safePage ? pageBtnActive : pageBtn}
                    onClick={() => onPageChange(p)}
                  >
                    {p}
                  </button>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <button
                type="button"
                className={pageBtnGhost}
                disabled={safePage >= totalPages}
                onClick={() => onPageChange(safePage + 1)}
              >
                Próxima →
              </button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : (
        <p className="text-[12px] text-[var(--ds-color-muted-foreground)]">
          Página 1 de 1
        </p>
      )}
    </div>
  );
}
