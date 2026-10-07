import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (newPage: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ page, totalPages, hasNextPage, hasPreviousPage, onPageChange }) => {
  if (totalPages <= 1) return null;

  // Build page numbers to show
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-2 mt-8 animate-fade-in-up">
      <button
        onClick={() => onPageChange(page - 1)} disabled={!hasPreviousPage}
        className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-white bg-surface border border-border hover:border-border-light rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:-translate-x-0.5"
        aria-label="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Prev</span>
      </button>

      <div className="flex items-center gap-1">
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-2 text-slate-600">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`w-9 h-9 text-sm font-medium rounded-xl transition-all duration-200 ${
                page === p
                  ? 'bg-gradient-to-br from-primary-600 to-accent-purple text-white shadow-glow-sm scale-105'
                  : 'text-slate-400 hover:text-white hover:bg-surface-elevated border border-transparent hover:border-border'
              }`}
            >
              {p}
            </button>
          )
        )}
      </div>

      <button
        onClick={() => onPageChange(page + 1)} disabled={!hasNextPage}
        className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-white bg-surface border border-border hover:border-border-light rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:translate-x-0.5"
        aria-label="Next page"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default Pagination;
