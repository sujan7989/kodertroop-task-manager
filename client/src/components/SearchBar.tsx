import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLazyQuery } from '@apollo/client';
import { Search, X, Loader2, Zap, Database } from 'lucide-react';
import { SEARCH_TASKS_QUERY } from '../graphql/tasks';
import { Task } from '../types/task';

interface SearchBarProps {
  onResults: (tasks: Task[] | null) => void;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  onResults,
  placeholder = 'Search tasks by title or description...',
}) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [searchMode, setSearchMode] = useState<'es' | 'mongo' | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQuery = useRef('');

  const [runSearch, { loading }] = useLazyQuery<{ searchTasks: Task[] }>(
    SEARCH_TASKS_QUERY,
    {
      fetchPolicy: 'network-only',
      onCompleted: (data) => {
        // Detect if fallback to MongoDB was used (no way to tell from GQL,
        // but we track ES health via the health endpoint result stored in window)
        const esUp = (window as unknown as Record<string, unknown>).__ES_UP__ === true;
        setSearchMode(esUp ? 'es' : 'mongo');
        onResults(data.searchTasks);
      },
      onError: () => {
        setSearchMode(null);
        onResults([]);
      },
    }
  );

  // Check ES health once on mount and store on window for SearchBar to read
  useEffect(() => {
    fetch('http://localhost:4000/health')
      .then((r) => r.json())
      .then((d: { elasticsearch?: string }) => {
        (window as unknown as Record<string, unknown>).__ES_UP__ =
          d.elasticsearch === 'UP';
      })
      .catch(() => {
        (window as unknown as Record<string, unknown>).__ES_UP__ = false;
      });
  }, []);

  const doSearch = useCallback(
    (q: string) => {
      if (q.trim().length >= 2) {
        void runSearch({ variables: { query: q.trim() } });
      }
    },
    [runSearch]
  );

  useEffect(() => {
    latestQuery.current = query;
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      onResults(null);
      setSearchMode(null);
      return;
    }

    debounceTimer.current = setTimeout(() => {
      doSearch(latestQuery.current);
    }, 250);

    return () => {
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const clear = () => {
    setQuery('');
    setSearchMode(null);
    onResults(null);
  };

  return (
    <div className={`relative flex-1 max-w-md transition-all duration-200 ${isFocused ? 'max-w-lg' : ''}`}>
      {/* Left icon */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
        {loading ? (
          <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />
        ) : (
          <Search className={`w-4 h-4 transition-colors duration-200 ${isFocused ? 'text-primary-400' : 'text-slate-500'}`} />
        )}
        {isFocused && !loading && (
          <span className="hidden sm:flex items-center gap-0.5 text-xs font-medium text-primary-500/70">
            {searchMode === 'mongo' ? (
              <><Database className="w-2.5 h-2.5" />DB</>
            ) : (
              <><Zap className="w-2.5 h-2.5" />ES</>
            )}
          </span>
        )}
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className={`w-full pl-10 sm:pl-14 pr-10 py-2.5 bg-surface border rounded-xl focus:outline-none text-slate-100 placeholder-slate-500 text-sm transition-all duration-200 ${
          isFocused
            ? 'border-primary-500/60 bg-surface-secondary shadow-glow-sm'
            : 'border-border hover:border-border-light'
        }`}
        aria-label="Search tasks"
      />

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
    </div>
  );
};

export default SearchBar;
