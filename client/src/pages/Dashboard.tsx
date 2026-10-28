import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@apollo/client';
import {
  GET_TASKS_QUERY, CREATE_TASK_MUTATION, UPDATE_TASK_MUTATION, DELETE_TASK_MUTATION,
} from '../graphql/tasks';
import { Task, TaskPriority, CreateTaskInput, UpdateTaskInput, PaginatedTasks } from '../types/task';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Plus, SortAsc, CheckCircle2, Circle, LayoutList, RefreshCw, Filter, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import Navbar from '../components/Navbar';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import TaskSkeleton from '../components/TaskSkeleton';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';

type FilterStatus   = 'all' | 'active' | 'completed';
type FilterPriority = 'all' | TaskPriority;
type SortType       = 'date-desc' | 'date-asc' | 'title-asc' | 'priority-high' | 'priority-low';

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const PAGE_SIZE = 10;

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { showToast } = useToast();

  const [currentPage,    setCurrentPage]    = useState(1);
  const [filterStatus,   setFilterStatus]   = useState<FilterStatus>('all');
  const [filterPriority, setFilterPriority] = useState<FilterPriority>('all');
  const [sortType,       setSortType]       = useState<SortType>('date-desc');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [searchResults,  setSearchResults]  = useState<Task[] | null>(null);
  const [showModal,      setShowModal]      = useState(false);
  const [editingTask,    setEditingTask]    = useState<Task | null>(null);
  const [deleteId,       setDeleteId]       = useState<string | null>(null);
  const [searchReset,    setSearchReset]    = useState(0);

  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });

  const openFilterMenu = () => {
    if (filterBtnRef.current) {
      const rect = filterBtnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setShowFilterMenu((v) => !v);
  };

  useEffect(() => {
    if (!showFilterMenu) return;
    const close = () => setShowFilterMenu(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [showFilterMenu]);

  // Keyboard shortcuts: N = new task, Esc = close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === 'n' && !inInput && !showModal) {
        e.preventDefault();
        setEditingTask(null);
        setShowModal(true);
      }
      if (e.key === 'Escape') {
        setShowFilterMenu(false);
        setDeleteId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showModal]);

  const filterCompleted = filterStatus === 'active' ? false : filterStatus === 'completed' ? true : undefined;

  const { data, loading, refetch, error } = useQuery<{ getTasks: PaginatedTasks }>(GET_TASKS_QUERY, {
    variables: {
      page: currentPage,
      limit: PAGE_SIZE,
      filter: filterCompleted !== undefined ? { completed: filterCompleted } : undefined,
    },
    fetchPolicy: 'cache-and-network',
  });

  const [createTask, { loading: creating }] = useMutation(CREATE_TASK_MUTATION, {
    onCompleted: () => {
      setShowModal(false);
      setCurrentPage(1);
      void refetch();
      showToast('success', 'Task created successfully!');
    },
    onError: (err: { message?: string }) => showToast('error', err.message ?? 'Failed to create task'),
  });

  const [updateTask, { loading: updating }] = useMutation(UPDATE_TASK_MUTATION, {
    onCompleted: (_, opts) => {
      const isToggle = opts?.variables?.input?.title === undefined &&
                       opts?.variables?.input?.completed !== undefined;
      setShowModal(false);
      setEditingTask(null);
      void refetch();
      showToast('success', isToggle ? 'Task updated!' : 'Task saved!');
    },
    onError: (err: { message?: string }) => showToast('error', err.message ?? 'Failed to update task'),
  });

  const [deleteTask, { loading: deleting }] = useMutation(DELETE_TASK_MUTATION, {
    onCompleted: () => {
      const tasks = data?.getTasks.tasks ?? [];
      if (tasks.length <= 1 && currentPage > 1) setCurrentPage((p) => p - 1);
      else void refetch();
      showToast('success', 'Task deleted');
      setDeleteId(null);
    },
    onError: (err: { message?: string }) => {
      showToast('error', err.message ?? 'Failed to delete task');
      setDeleteId(null);
    },
  });

  const handleModalSubmit = (input: CreateTaskInput | UpdateTaskInput) => {
    if (editingTask) void updateTask({ variables: { id: editingTask.id, input } });
    else void createTask({ variables: { input } });
  };

  const handleToggleComplete = useCallback((task: Task) => {
    void updateTask({ variables: { id: task.id, input: { completed: !task.completed } } });
  }, [updateTask]);

  const handleDelete = useCallback((id: string) => setDeleteId(id), []);
  const handleConfirmDelete = () => { if (deleteId) void deleteTask({ variables: { id: deleteId } }); };

  const handleEdit = useCallback((task: Task) => { setEditingTask(task); setShowModal(true); }, []);
  const handleCloseModal = () => { setShowModal(false); setEditingTask(null); };
  const handleLogout = () => { logout(); navigate('/login'); };

  const handleTabChange = (tab: FilterStatus) => {
    setFilterStatus(tab);
    setCurrentPage(1);
    setSearchResults(null);
    setSearchReset((n) => n + 1);
  };

  // Client-side priority filter + sort
  const sourceTasks = searchResults !== null ? searchResults : (data?.getTasks.tasks ?? []);
  const filteredAndSorted = (() => {
    let tasks = sourceTasks;
    if (filterPriority !== 'all') tasks = tasks.filter((t) => t.priority === filterPriority);
    return [...tasks].sort((a, b) => {
      switch (sortType) {
        case 'date-asc':      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'title-asc':     return a.title.localeCompare(b.title);
        case 'priority-high': return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        case 'priority-low':  return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
        default:              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  })();

  const paginationData = data?.getTasks;
  const allTasks       = data?.getTasks.tasks ?? [];
  const activeCount    = searchResults !== null ? searchResults.filter((t) => !t.completed).length : allTasks.filter((t) => !t.completed).length;
  const completedCount = searchResults !== null ? searchResults.filter((t) => t.completed).length : allTasks.filter((t) => t.completed).length;
  const totalCount     = searchResults !== null ? searchResults.length : (paginationData?.totalCount ?? 0);

  const isFiltered = filterStatus !== 'all' || filterPriority !== 'all' || searchResults !== null;

  // Initial loading
  if (loading && !data) {
    return (
      <div className="min-h-screen bg-mesh">
        <div className="h-16 bg-surface/80 border-b border-border/50 sticky top-0 z-40" />
        <main className="container mx-auto px-4 py-6 max-w-5xl">
          <div className="h-10 w-48 bg-surface rounded-2xl mb-6" />
          <div className="flex gap-3 mb-6">
            <div className="h-10 flex-1 max-w-sm bg-surface rounded-xl" />
            <div className="h-10 w-32 bg-surface rounded-xl" />
            <div className="h-10 w-28 bg-surface rounded-xl" />
          </div>
          <TaskSkeleton />
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center px-4">
        <div className="glass rounded-3xl p-8 max-w-md w-full text-center animate-fade-in-scale">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Failed to load tasks</h2>
          <p className="text-slate-400 text-sm mb-6">Something went wrong. Please try again.</p>
          <button
            onClick={() => void refetch()}
            className="px-6 py-2.5 bg-gradient-to-r from-primary-600 to-accent-purple text-white font-semibold rounded-xl shadow-glow hover:shadow-glow-lg transition-all"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh">
      <Navbar
        userName={user?.name ?? ''}
        activeCount={activeCount}
        completedCount={completedCount}
        totalCount={totalCount}
        onLogout={handleLogout}
      />

      <main className="container mx-auto px-4 py-6 lg:py-8 max-w-5xl">

        {/* Status tabs */}
        <div className="flex gap-1 p-1 bg-surface border border-border rounded-2xl w-fit mb-6 animate-fade-in-up">
          {([
            { value: 'all',       label: 'All',       icon: <LayoutList className="w-3.5 h-3.5" /> },
            { value: 'active',    label: 'Active',    icon: <Circle className="w-3.5 h-3.5" /> },
            { value: 'completed', label: 'Completed', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
          ] as { value: FilterStatus; label: string; icon: React.ReactNode }[]).map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                filterStatus === tab.value
                  ? 'bg-gradient-to-r from-primary-600 to-accent-purple text-white shadow-glow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-surface-elevated'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-5 animate-fade-in-up">
          <SearchBar
            onResults={setSearchResults}
            resetTrigger={searchReset}
          />

          <div className="flex gap-2.5 w-full sm:w-auto">
            {/* Filter & Sort */}
            <div className="relative">
              <button
                ref={filterBtnRef}
                onClick={openFilterMenu}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border transition-all duration-150 ${
                  filterPriority !== 'all' || sortType !== 'date-desc'
                    ? 'bg-primary-500/10 border-primary-500/40 text-primary-400'
                    : 'bg-surface border-border text-slate-400 hover:text-white hover:border-border-light'
                }`}
                aria-label="Filter and sort tasks"
              >
                <SortAsc className="w-4 h-4" />
                <span className="hidden sm:inline">Filter & Sort</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${showFilterMenu ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* New Task */}
            <button
              onClick={() => { setEditingTask(null); setShowModal(true); }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-600 to-accent-purple hover:from-primary-500 hover:to-accent-purple text-white font-semibold text-sm rounded-xl shadow-glow hover:shadow-glow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150"
              aria-label="Create new task (N)"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
          </div>
        </div>

        {/* Active filters / search info bar */}
        {(searchResults !== null || filterPriority !== 'all') && (
          <div className="flex items-center justify-between mb-4 px-4 py-2.5 bg-primary-500/8 border border-primary-500/15 rounded-xl animate-fade-in-scale">
            <div className="flex items-center gap-2 text-sm text-primary-300">
              <Filter className="w-3.5 h-3.5" />
              <span>
                {searchResults !== null
                  ? `${filteredAndSorted.length} search result${filteredAndSorted.length !== 1 ? 's' : ''}`
                  : `Filtered by ${filterPriority} priority`}
                {filterPriority !== 'all' && searchResults !== null && ` · ${filterPriority} priority`}
              </span>
            </div>
            <button
              onClick={() => { setSearchResults(null); setFilterPriority('all'); setSearchReset((n) => n + 1); }}
              className="text-xs text-slate-500 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
            >
              ✕ Clear
            </button>
          </div>
        )}

        {/* Refresh indicator */}
        {loading && data && (
          <div className="flex justify-center mb-3">
            <div className="flex items-center gap-2 text-xs text-slate-600 bg-surface border border-border rounded-full px-3 py-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" /> Refreshing...
            </div>
          </div>
        )}

        {/* Task list */}
        {filteredAndSorted.length === 0 ? (
          <EmptyState
            type={searchResults !== null ? 'search' : isFiltered ? 'filter' : 'empty'}
            title={
              searchResults !== null
                ? 'No tasks match your search'
                : filterStatus === 'completed'
                ? 'No completed tasks yet'
                : filterStatus === 'active'
                ? 'All done! No active tasks'
                : filterPriority !== 'all'
                ? `No ${filterPriority} priority tasks`
                : 'No tasks yet'
            }
            description={
              searchResults === null && filterStatus === 'all' && filterPriority === 'all'
                ? 'Create your first task to get started. Press N to open the form.'
                : undefined
            }
            action={
              isFiltered
                ? {
                    label: 'Clear filters',
                    onClick: () => { setFilterStatus('all'); setFilterPriority('all'); setSearchResults(null); setSearchReset((n) => n + 1); },
                  }
                : filterStatus === 'all' && filterPriority === 'all'
                ? { label: '+ Create your first task', onClick: () => { setEditingTask(null); setShowModal(true); } }
                : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredAndSorted.map((task, i) => (
              <TaskCard
                key={task.id}
                task={task}
                index={i}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {searchResults === null && paginationData && (
          <Pagination
            page={paginationData.page}
            totalPages={paginationData.totalPages}
            hasNextPage={paginationData.hasNextPage}
            hasPreviousPage={paginationData.hasPreviousPage}
            onPageChange={setCurrentPage}
          />
        )}

        {/* Summary line */}
        {filteredAndSorted.length > 0 && (
          <p className="text-center text-xs text-slate-600 mt-5">
            {searchResults !== null
              ? `${filteredAndSorted.length} result${filteredAndSorted.length !== 1 ? 's' : ''} found`
              : `Showing ${filteredAndSorted.length} of ${totalCount} task${totalCount !== 1 ? 's' : ''}`}
            {completedCount > 0 && ` · ${completedCount} completed`}
          </p>
        )}

        {/* Keyboard hint */}
        <p className="text-center text-xs text-slate-700 mt-2">
          <kbd className="font-mono bg-surface-elevated border border-border/50 rounded px-1">N</kbd> new task
          {' · '}
          <kbd className="font-mono bg-surface-elevated border border-border/50 rounded px-1">/</kbd> search
        </p>
      </main>

      {/* Task modal */}
      {showModal && (
        <TaskModal
          mode={editingTask ? 'edit' : 'create'}
          initialValues={editingTask ?? undefined}
          onSubmit={handleModalSubmit}
          onClose={handleCloseModal}
          isLoading={creating || updating}
        />
      )}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        isOpen={deleteId !== null}
        title="Delete task?"
        message="This action cannot be undone. The task will be permanently removed from your list and search index."
        confirmLabel={deleting ? 'Deleting...' : 'Delete task'}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* Filter & Sort portal dropdown */}
      {showFilterMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowFilterMenu(false)} />
          <div className="fixed z-[9999] animate-fade-in-scale" style={{ top: dropdownPos.top, right: dropdownPos.right }}>
            <div className="rounded-2xl shadow-2xl py-2 w-56 overflow-hidden" style={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="px-4 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Priority</p>
              {(['all', 'high', 'medium', 'low'] as FilterPriority[]).map((p) => (
                <button key={p}
                  onClick={() => { setFilterPriority(p); setShowFilterMenu(false); }}
                  className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2.5 transition-colors ${filterPriority === p ? 'text-primary-400 bg-primary-500/10' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
                >
                  {p !== 'all' && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p === 'high' ? 'bg-red-400' : p === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'}`} />}
                  {p === 'all' ? 'All Priorities' : `${p.charAt(0).toUpperCase() + p.slice(1)} Priority`}
                  {filterPriority === p && p !== 'all' && <span className="ml-auto text-primary-400">✓</span>}
                </button>
              ))}
              <div className="border-t border-white/8 my-1.5 mx-2" />
              <p className="px-4 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sort by</p>
              {([
                { value: 'date-desc',     label: '📅 Newest first' },
                { value: 'date-asc',      label: '📅 Oldest first' },
                { value: 'title-asc',     label: '🔤 Title A → Z' },
                { value: 'priority-high', label: '🔴 High priority first' },
                { value: 'priority-low',  label: '🟢 Low priority first' },
              ] as { value: SortType; label: string }[]).map((opt) => (
                <button key={opt.value}
                  onClick={() => { setSortType(opt.value); setShowFilterMenu(false); }}
                  className={`w-full px-4 py-2.5 text-left text-sm flex items-center transition-colors ${sortType === opt.value ? 'text-primary-400 bg-primary-500/10' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
                >
                  {opt.label}
                  {sortType === opt.value && <span className="ml-auto text-primary-400">✓</span>}
                </button>
              ))}
              {(filterPriority !== 'all' || sortType !== 'date-desc') && (
                <>
                  <div className="border-t border-white/8 my-1.5 mx-2" />
                  <button
                    onClick={() => { setFilterPriority('all'); setSortType('date-desc'); setShowFilterMenu(false); }}
                    className="w-full px-4 py-2.5 text-left text-xs text-red-400/80 hover:text-red-400 hover:bg-red-500/8 transition-colors"
                  >
                    ✕ Reset filters
                  </button>
                </>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default Dashboard;
