import React, { useState, useEffect, useRef } from 'react';
import { useLazyQuery } from '@apollo/client';
import { Search, X, Loader2, Zap } from 'lucide-react';
import { SEARCH_TASKS_QUERY } from '../graphql/tasks';
import { Task } from '../types/task';

interface SearchBarProps {
  onResults: (tasks: Task[] | null) => void;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ onResults, placeholder = 'Search tasks by title or description...' }) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [runSearch, { loading }] = useLazyQuery<{ searchTasks: Task[] }>(SEARCH_TASKS_QUERY, {
    onCompleted: (data) => onResults(data.searchTasks),
    onError: () => onResults([]),
  });

  useEffect(() => {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) { onResults(null); return; }
    debounceTimer.current = setTimeout(() => {
      void runSearch({ variables: { query: trimmed } });
    }, 350);
    return () => { if (debounceTimer.current !== null) clearTimeout(debounceTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const clear = () => { setQuery(''); onResults(null); };

  return (
    <div className={`relative flex-1 max-w-md transition-all duration-300 ${isFocused ? 'max-w-lg' : ''}`}>
      {/* Search icon / ES indicator */}
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        <Search className={`w-4 h-4 transition-colors duration-200 ${isFocused ? 'text-primary-400' : 'text-slate-500'}`} />
        {isFocused && (
          <span className="text-xs text-primary-500/70 font-medium hidden sm:flex items-center gap-0.5">
            <Zap className="w-2.5 h-2.5" />ES
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
        className={`w-full pl-10 sm:pl-16 pr-10 py-2.5 bg-surface border rounded-xl focus:outline-none text-slate-100 placeholder-slate-500 text-sm transition-all duration-300 ${
          isFocused
            ? 'border-primary-500/60 bg-surface-secondary shadow-glow-sm'
            : 'border-border hover:border-border-light'
        }`}
        aria-label="Search tasks"
      />

      {/* Right side */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        {loading && <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />}
        {!loading && query.length > 0 && (
          <button onClick={clear} className="text-slate-500 hover:text-white transition-colors p-0.5 rounded-lg hover:bg-surface-elevated" aria-label="Clear search">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default SearchBar;
