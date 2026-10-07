import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@apollo/client';
import {
  GET_TASKS_QUERY, CREATE_TASK_MUTATION, UPDATE_TASK_MUTATION, DELETE_TASK_MUTATION,
} from '../graphql/tasks';
import { Task, TaskPriority, CreateTaskInput, UpdateTaskInput, PaginatedTasks } from '../types/task';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Plus, Filter, ChevronDown, SortAsc, CheckCircle2, Circle, LayoutList, RefreshCw } from 'lucide-react';
import Navbar from '../components/Navbar';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

type FilterStatus = 'all' | 'active' | 'completed';
type FilterPriority = 'all' | TaskPriority;
type SortType = 'date-desc' | 'date-asc' | 'title-asc' | 'priority-high' | 'priority-low';

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const PAGE_SIZE = 10;

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { showToast } = useToast();

  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPriority, setFilterPriority] = useState<FilterPriority>('all');
  const [sortType, setSortType] = useState<SortType>('date-desc');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [searchResults, setSearchResults] = useState<Task[] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const filterCompleted = filterStatus === 'active' ? false : filterStatus === 'completed' ? true : undefined;

  const { data, loading, refetch, error } = useQuery<{ getTasks: PaginatedTasks }>(GET_TASKS_QUERY, {
    variables: { page: currentPage, limit: PAGE_SIZE, filter: filterCompleted !== undefined ? { completed: filterCompleted } : undefined },
    fetchPolicy: 'cache-and-network',
  });

  const [createTask, { loading: creating }] = useMutation(CREATE_TASK_MUTATION, {
    onCompleted: () => { setShowModal(false); setCurrentPage(1); void refetch(); showToast('success', 'Task created!'); },
    onError: (err: { message?: string }) => showToast('error', err.message ?? 'Failed to create task'),
  });

  const [updateTask, { loading: updating }] = useMutation(UPDATE_TASK_MUTATION, {
    onCompleted: () => { setShowModal(false); setEditingTask(null); void refetch(); showToast('success', 'Task updated!'); },
    onError: (err: { message?: string }) => showToast('error', err.message ?? 'Failed to update task'),
  });

  const [deleteTask] = useMutation(DELETE_TASK_MUTATION, {
    onCompleted: () => {
      const tasks = data?.getTasks.tasks ?? [];
      if (tasks.length <= 1 && currentPage > 1) setCurrentPage((p) => p - 1);
      else void refetch();
      showToast('success', 'Task deleted');
    },
    onError: (err: { message?: string }) => showToast('error', err.message ?? 'Failed to delete task'),
  });

  const handleModalSubmit = (input: CreateTaskInput | UpdateTaskInput) => {
    if (editingTask) void updateTask({ variables: { id: editingTask.id, input } });
    else void createTask({ variables: { input } });
  };
  const handleToggleComplete = (task: Task) => void updateTask({ variables: { id: task.id, input: { completed: !task.completed } } });
  const handleDelete = (id: string) => { if (window.confirm('Delete this task? This cannot be undone.')) void deleteTask({ variables: { id } }); };
  const handleEdit = (task: Task) => { setEditingTask(task); setShowModal(true); };
  const handleCloseModal = () => { setShowModal(false); setEditingTask(null); };
  const handleLogout = () => { logout(); navigate('/login'); };

  const sourceTasks = searchResults !== null ? searchResults : (data?.getTasks.tasks ?? []);
  const filteredAndSorted = (() => {
    let tasks = sourceTasks;
    if (filterPriority !== 'all') tasks = tasks.filter((t) => t.priority === filterPriority);
    return [...tasks].sort((a, b) => {
      switch (sortType) {
        case 'date-asc': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'title-asc': return a.title.localeCompare(b.title);
        case 'priority-high': return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        case 'priority-low': return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  })();

  const paginationData = data?.getTasks;
  const allTasks = data?.getTasks.tasks ?? [];
  const activeCount = searchResults !== null ? searchResults.filter((t) => !t.completed).length : allTasks.filter((t) => !t.completed).length;
  const completedCount = searchResults !== null ? searchResults.filter((t) => t.completed).length : allTasks.filter((t) => t.completed).length;
  const totalCount = searchResults !== null ? searchResults.length : (paginationData?.totalCount ?? 0);

  if (loading && !data) return <LoadingSpinner fullScreen message="Loading your workspace..." />;

  if (error) return (
    <div className="min-h-screen bg-mesh flex items-center justify-center px-4">
      <div className="glass rounded-3xl p-8 max-w-md w-full text-center animate-fade-in-scale">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <RefreshCw className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Failed to load tasks</h2>
        <p className="text-slate-400 text-sm mb-6">Something went wrong. Please try again.</p>
        <button onClick={() => void refetch()} className="px-6 py-2.5 bg-gradient-to-r from-primary-600 to-accent-purple text-white font-semibold rounded-xl shadow-glow hover:shadow-glow-lg transition-all">
          Try again
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-mesh">
      <Navbar userName={user?.name ?? ''} activeCount={activeCount} completedCount={completedCount} totalCount={totalCount} onLogout={handleLogout} />

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
              onClick={() => { setFilterStatus(tab.value); setCurrentPage(1); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
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
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-6 animate-fade-in-up delay-100">
          <SearchBar onResults={setSearchResults} />

          <div className="flex gap-2.5 w-full sm:w-auto">
            {/* Filter & Sort */}
            <div className="relative">
              <button
                onClick={() => setShowFilterMenu((v) => !v)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border transition-all duration-200 ${
                  filterPriority !== 'all' || sortType !== 'date-desc'
                    ? 'bg-primary-500/10 border-primary-500/40 text-primary-400'
                    : 'bg-surface border-border text-slate-400 hover:text-white hover:border-border-light'
                }`}
              >
                <SortAsc className="w-4 h-4" />
                <span className="hidden sm:inline">Filter & Sort</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showFilterMenu ? 'rotate-180' : ''}`} />
              </button>

              {showFilterMenu && (
                <div
                  className="absolute right-0 top-full mt-2 glass-strong border border-border/80 rounded-2xl shadow-modal py-2 min-w-[210px] z-20 animate-fade-in-scale"
                  onMouseLeave={() => setShowFilterMenu(false)}
                >
                  <p className="px-4 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest">Priority</p>
                  {(['all', 'high', 'medium', 'low'] as FilterPriority[]).map((p) => (
                    <button key={p} onClick={() => { setFilterPriority(p); setShowFilterMenu(false); }}
                      className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${filterPriority === p ? 'text-primary-400 bg-primary-500/5' : 'text-slate-300 hover:text-white hover:bg-surface-elevated'}`}>
                      {p !== 'all' && <span className={`w-2 h-2 rounded-full ${p === 'high' ? 'bg-red-400' : p === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'}`} />}
                      {p === 'all' ? 'All Priorities' : `${p.charAt(0).toUpperCase() + p.slice(1)} Priority`}
                    </button>
                  ))}
                  <div className="border-t border-border my-1.5" />
                  <p className="px-4 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest">Sort by</p>
                  {([
                    { value: 'date-desc', label: '📅 Newest first' },
                    { value: 'date-asc', label: '📅 Oldest first' },
                    { value: 'title-asc', label: '🔤 Title A → Z' },
                    { value: 'priority-high', label: '🔴 High priority first' },
                    { value: 'priority-low', label: '🟢 Low priority first' },
                  ] as { value: SortType; label: string }[]).map((opt) => (
                    <button key={opt.value} onClick={() => { setSortType(opt.value); setShowFilterMenu(false); }}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors ${sortType === opt.value ? 'text-primary-400 bg-primary-500/5' : 'text-slate-300 hover:text-white hover:bg-surface-elevated'}`}>
                      {opt.label}
                    </button>
                  ))}
                  {(filterPriority !== 'all' || sortType !== 'date-desc') && (
                    <>
                      <div className="border-t border-border my-1.5" />
                      <button onClick={() => { setFilterPriority('all'); setSortType('date-desc'); setShowFilterMenu(false); }}
                        className="w-full px-4 py-2 text-left text-xs text-red-400 hover:bg-red-500/5 transition-colors">
                        ✕ Clear filters
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* New Task */}
            <button
              onClick={() => { setEditingTask(null); setShowModal(true); }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-600 to-accent-purple hover:from-primary-500 hover:to-accent-purple text-white font-semibold text-sm rounded-xl shadow-glow hover:shadow-glow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
          </div>
        </div>

        {/* Search mode banner */}
        {searchResults !== null && (
          <div className="flex items-center justify-between mb-4 px-4 py-2.5 bg-primary-500/10 border border-primary-500/20 rounded-xl animate-fade-in-scale">
            <div className="flex items-center gap-2 text-sm text-primary-300">
              <Filter className="w-4 h-4" />
              <span>Showing <strong>{filteredAndSorted.length}</strong> search result{filteredAndSorted.length !== 1 ? 's' : ''} via Elasticsearch</span>
            </div>
            <button onClick={() => setSearchResults(null)} className="text-xs text-slate-500 hover:text-white transition-colors">
              ✕ Clear
            </button>
          </div>
        )}

        {/* Loading refresh overlay */}
        {loading && data && (
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-surface border border-border rounded-full px-3 py-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" /> Refreshing...
            </div>
          </div>
        )}

        {/* Task list */}
        {filteredAndSorted.length === 0 ? (
          <EmptyState
            type={searchResults !== null ? 'search' : filterStatus !== 'all' || filterPriority !== 'all' ? 'filter' : 'empty'}
            title={
              searchResults !== null ? 'No tasks match your search.' :
              filterStatus === 'completed' ? 'No completed tasks yet.' :
              filterStatus === 'active' ? 'No active tasks — great job!' :
              filterPriority !== 'all' ? `No ${filterPriority} priority tasks.` :
              'No tasks yet.'
            }
            description={
              searchResults === null && filterStatus === 'all' && filterPriority === 'all'
                ? 'Create your first task to start being productive.'
                : undefined
            }
            action={
              searchResults === null && filterStatus === 'all' && filterPriority === 'all'
                ? { label: 'Create your first task', onClick: () => { setEditingTask(null); setShowModal(true); } }
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

        {/* Footer stats */}
        {filteredAndSorted.length > 0 && (
          <p className="text-center text-xs text-slate-600 mt-6">
            Showing {filteredAndSorted.length} of {totalCount} tasks
          </p>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <TaskModal
          mode={editingTask ? 'edit' : 'create'}
          initialValues={editingTask ?? undefined}
          onSubmit={handleModalSubmit}
          onClose={handleCloseModal}
          isLoading={creating || updating}
        />
      )}
    </div>
  );
};

export default Dashboard;
