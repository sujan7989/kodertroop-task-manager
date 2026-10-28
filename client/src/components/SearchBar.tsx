import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLazyQuery } from '@apollo/client';
import { Search, X, Loader2, Zap, Database } from 'lucide-react';
import { SEARCH_TASKS_QUERY } from '../graphql/tasks';
import { Task } from '../types/task';

interface SearchBarProps {
  onResults: (tasks: Task[] | null) => void;
  placeholder?: string;
  resetTrigger?: number;
}

const SearchBar: React.FC<SearchBarProps> = ({
  onResults,
  placeholder = 'Search tasks...',
  resetTrigger = 0,
}) => {
  const [query, setQuery]       = useState('');
  const [isFocused, setFocused] = useState(false);
  const [esUp, setEsUp]         = useState<boolean | null>(null);
  const debounceTimer           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQuery             = useRef('');
  const inputRef                = useRef<HTMLInputElement>(null);

  // Check ES health once on mount
  useEffect(() => {
    fetch('http://localhost:4000/health')
      .then((r) => r.json() as Promise<{ elasticsearch?: string }>)
      .then((d) => setEsUp(d.elasticsearch === 'UP'))
      .catch(() => setEsUp(false));
  }, []);

  // Reset when trigger changes (tab switch)
  useEffect(() => {
    if (resetTrigger === 0) return;
    setQuery('');
    onResults(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTrigger]);

  // Keyboard shortcut: '/' focuses search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const [runSearch, { loading }] = useLazyQuery<{ searchTasks: Task[] }>(
    SEARCH_TASKS_QUERY,
    {
      fetchPolicy: 'network-only',
      onCompleted: (data) => onResults(data.searchTasks),
      onError: () => onResults([]),
    }
  );

  const doSearch = useCallback(
    (q: string) => void runSearch({ variables: { query: q.trim() } }),
    [runSearch]
  );

  useEffect(() => {
    latestQuery.current = query;
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    if (query.trim().length < 2) { onResults(null); return; }
    debounceTimer.current = setTimeout(() => doSearch(latestQuery.current), 250);
    return () => { if (debounceTimer.current !== null) clearTimeout(debounceTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const clear = () => { setQuery(''); onResults(null); };
  const isSearching = query.trim().length >= 2;

  return (
    <div className={`relative flex-1 max-w-sm transition-all duration-200 ${isFocused ? 'max-w-md' : ''}`}>
      {/* Left icon */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none z-10">
        {loading
          ? <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />
          : <Search className={`w-4 h-4 transition-colors duration-150 ${isFocused ? 'text-primary-400' : 'text-slate-500'}`} />
        }
        {isFocused && isSearching && esUp !== null && (
          <span className="hidden sm:flex items-center gap-0.5 text-[10px] font-semibold leading-none">
            {esUp
              ? <span className="text-primary-400 flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />ES</span>
              : <span className="text-amber-400 flex items-center gap-0.5"><Database className="w-2.5 h-2.5" />DB</span>
            }
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={isFocused && !isSearching ? 'Type at least 2 characters...' : placeholder}
        className={`w-full pl-9 sm:pl-12 pr-9 py-2.5 bg-surface border rounded-xl focus:outline-none text-slate-100 placeholder-slate-500 text-sm transition-all duration-200 ${
          isFocused
            ? 'border-primary-500/50 bg-surface-secondary shadow-glow-sm'
            : 'border-border hover:border-border-light'
        }`}
        aria-label="Search tasks"
      />

      {/* Keyboard hint */}
      {!isFocused && !query && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center">
          <kbd className="text-[10px] text-slate-600 bg-surface-elevated border border-border/50 rounded px-1 py-0.5 font-mono">/</kbd>
        </div>
      )}

      {/* Clear button */}
      {query.length > 0 && !loading && (
        <button
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors p-0.5 rounded-lg hover:bg-surface-elevated"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* ES not ready warning */}
      {isFocused && isSearching && esUp === false && (
        <div className="absolute top-full left-0 right-0 mt-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 flex items-center gap-2 z-10">
          <Database className="w-3 h-3 flex-shrink-0" />
          Searching database (Elasticsearch is starting...)
        </div>
      )}
    </div>
  );
};

export default SearchBar;
