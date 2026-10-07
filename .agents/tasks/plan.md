# Implementation Plan — KoderTroop Task Management App

## Key facts discovered during exploration

- **Server build command**: `npm run typecheck` (runs `tsc --noEmit`), source in `server/src/`, outputs to `server/dist/`
- **Client build command**: `npm run typecheck` (runs `tsc --noEmit`), `npm run build` (runs `tsc && vite build`)
- **Tailwind custom theme**: `primary.*`, `background: #0f172a`, `surface: #1e293b`, `border: #334155`
- **Apollo client env var**: reads `VITE_GRAPHQL_URL` (not `VITE_API_URL`) — constants.ts defines both but client.ts uses `VITE_GRAPHQL_URL`
- **No client `.env` file exists** — must create `client/.env`
- **Auth token key**: client stores token as `localStorage.getItem('token')` (plain `'token'`, NOT the constant `STORAGE_KEYS.TOKEN`)
- **tsconfig strict mode**: `noUnusedLocals: true`, `noUnusedParameters: true`, `strictNullChecks: true` — every field must be used
- **No test framework installed** — verification is TypeScript typecheck + manual browser checks
- **Redis config uses REDIS_HOST/PORT** — .env already has these set correctly, no change needed
- **`cacheService.deserializeTasks`** does a strict shape check — adding new optional fields requires updating the push call
- **`searchService.documentFromTask`** is a private const inside the file — must be updated in-place

---

## STEP 1 — Add `priority` and `dueDate` to the Task Mongoose model

**What**: Extend the `Task` interface, `TaskDocument`, and `taskSchema` in `server/src/models/Task.ts`.

**Exact changes**:
- Add to `Task` interface:
  ```ts
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  ```
- Add to `taskSchema`:
  ```ts
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
  dueDate: {
    type: Date,
    required: false,
    default: undefined,
  },
  ```

**Files**: `server/src/models/Task.ts`

**Verify**: `cd server && npm run typecheck` — zero errors.

---

## STEP 2 — Add `priority` and `dueDate` to backend service layer

**What**: Update `PublicTask`, `CreateTaskInput`, `UpdateTaskInput`, `toPublicTask`, `createTask`, `updateTask`, and `validateCreateInput`/`validateUpdateInput` in `server/src/services/taskService.ts`.

**Exact changes**:

Add to `PublicTask` interface:
```ts
priority: 'low' | 'medium' | 'high';
dueDate?: Date;
```

Add to `CreateTaskInput` interface:
```ts
priority?: 'low' | 'medium' | 'high';
dueDate?: string; // ISO string from GraphQL, parsed to Date in service
```

Add to `UpdateTaskInput` interface:
```ts
priority?: 'low' | 'medium' | 'high';
dueDate?: string | null; // null means "clear the dueDate"
```

Update `toPublicTask`:
```ts
export const toPublicTask = (doc: TaskDocument): PublicTask => ({
  id: doc._id.toHexString(),
  title: doc.title,
  description: doc.description,
  completed: doc.completed,
  userId: doc.userId.toHexString(),
  priority: doc.priority,
  dueDate: doc.dueDate,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});
```

Update `validateCreateInput` — add after existing checks:
```ts
const VALID_PRIORITIES = ['low', 'medium', 'high'];
if (input.priority !== undefined && !VALID_PRIORITIES.includes(input.priority)) {
  throw new BadRequestError('Priority must be low, medium, or high');
}
if (input.dueDate !== undefined) {
  const parsed = new Date(input.dueDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError('dueDate must be a valid ISO date string');
  }
}
```

Update `validateUpdateInput` — add same checks as above (priority/dueDate fields).

Update `createTask` — in the `TaskModel.create(...)` call, add:
```ts
priority: input.priority ?? 'medium',
dueDate: input.dueDate !== undefined ? new Date(input.dueDate) : undefined,
```

Update `updateTask` — after existing field checks, add:
```ts
if (input.priority !== undefined) {
  doc.priority = input.priority;
}
if (input.dueDate !== undefined) {
  doc.dueDate = input.dueDate === null ? undefined : new Date(input.dueDate);
}
```

**Files**: `server/src/services/taskService.ts`

**Verify**: `cd server && npm run typecheck` — zero errors.

---

## STEP 3 — Update `cacheService` to handle `priority` and `dueDate`

**What**: `deserializeTasks` currently does a strict field check and `result.push({...})` that lists every field explicitly. Add `priority` and `dueDate` to that push call so cached tasks survive round-trips.

**Exact changes** in `server/src/services/cacheService.ts`:

In the `for` loop inside `deserializeTasks`, add after the existing type checks:
```ts
// Validate priority
const priority = rec.priority;
if (priority !== undefined && priority !== 'low' && priority !== 'medium' && priority !== 'high') {
  return null;
}
// dueDate is optional — parse if present
let dueDate: Date | undefined = undefined;
if (rec.dueDate !== undefined && rec.dueDate !== null) {
  const dueDateRaw = toDateIfIsoString(rec.dueDate);
  if (!(dueDateRaw instanceof Date)) return null;
  dueDate = dueDateRaw;
}
```

Update the `result.push(...)` call:
```ts
result.push({
  id: rec.id,
  title: rec.title,
  description: rec.description,
  completed: rec.completed,
  userId: rec.userId,
  priority: (priority as 'low' | 'medium' | 'high') ?? 'medium',
  dueDate,
  createdAt: createdAtRaw,
  updatedAt: updatedAtRaw,
});
```

**Files**: `server/src/services/cacheService.ts`

**Verify**: `cd server && npm run typecheck` — zero errors.

---

## STEP 4 — Update `searchService` to index `priority` and `dueDate`

**What**: Add both fields to the `documentFromTask` const so Elasticsearch stores them.

**Exact changes** in `server/src/services/searchService.ts`:

```ts
const documentFromTask = (task: PublicTask) => ({
  title: task.title,
  description: task.description,
  completed: task.completed,
  userId: task.userId,
  priority: task.priority,
  dueDate: task.dueDate !== undefined ? task.dueDate.toISOString() : null,
  createdAt: task.createdAt.toISOString(),
  updatedAt: task.updatedAt.toISOString(),
});
```

**Files**: `server/src/services/searchService.ts`

**Verify**: `cd server && npm run typecheck` — zero errors.

---

## STEP 5 — Add pagination to `getTasksForUser` service function

**What**: Add pagination + optional `completed` filter to `getTasksForUser`. Return a `PaginatedTasksResult` instead of a plain array.

**Exact changes** in `server/src/services/taskService.ts`:

Add new interface at top of file (after existing interfaces):
```ts
export interface GetTasksOptions {
  page?: number;    // 1-indexed, default 1
  limit?: number;   // default 20, max 100
  filterCompleted?: boolean; // undefined = all, true/false = filter
}

export interface PaginatedTasksResult {
  tasks: PublicTask[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

Replace the `getTasksForUser` function signature and body:
```ts
export const getTasksForUser = async (
  userId: string,
  options: GetTasksOptions = {}
): Promise<PaginatedTasksResult> => {
  if (!mongoose.isValidObjectId(userId)) {
    throw new BadRequestError('User id is invalid');
  }
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const skip = (page - 1) * limit;

  // Build MongoDB query filter
  const filter: Record<string, unknown> = { userId };
  if (options.filterCompleted !== undefined) {
    filter.completed = options.filterCompleted;
  }

  // Only use Redis cache when fetching page 1 with default limit and no filter
  const useCache =
    page === 1 &&
    limit === 20 &&
    options.filterCompleted === undefined;

  if (useCache) {
    const cached = await getCachedTasks(userId);
    if (cached !== null) {
      // cached is the full array; paginate in memory
      const total = cached.length;
      const sliced = cached.slice(0, limit);
      return {
        tasks: sliced,
        totalCount: total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: total > limit,
        hasPreviousPage: false,
      };
    }
  }

  const [docs, totalCount] = await Promise.all([
    TaskModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
    TaskModel.countDocuments(filter).exec(),
  ]);
  const tasks = docs.map(toPublicTask);

  if (useCache) {
    // For cache: store first-page tasks (the array used as "all tasks" for cache hit)
    // Re-fetch full list for cache storage to keep cache consistent
    const allDocs = await TaskModel.find({ userId }).sort({ createdAt: -1 }).exec();
    await setCachedTasks(userId, allDocs.map(toPublicTask));
  }

  return {
    tasks,
    totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit),
    hasNextPage: page * limit < totalCount,
    hasPreviousPage: page > 1,
  };
};
```

**Files**: `server/src/services/taskService.ts`

**Verify**: `cd server && npm run typecheck` — will show errors in resolvers (fixed in next step).

---

## STEP 6 — Update GraphQL typeDefs for priority, dueDate, and pagination

**What**: Add new types and update existing ones in `server/src/graphql/typeDefs.ts`.

**Exact replacement** — replace the entire `typeDefs` string:

```graphql
type Query {
  _health: Health!
  me: User
  getTasks(page: Int, limit: Int, filter: TaskFilter): PaginatedTasks!
  searchTasks(query: String!): [Task!]!
}

type Mutation {
  _health: Health!
  register(input: RegisterInput!): AuthPayload!
  login(input: LoginInput!): AuthPayload!
  createTask(input: CreateTaskInput!): Task!
  updateTask(id: ID!, input: UpdateTaskInput!): Task!
  deleteTask(id: ID!): Boolean!
}

type Health {
  status: String!
  timestamp: String!
}

type User {
  id: ID!
  name: String!
  email: String!
  createdAt: String!
  updatedAt: String!
}

enum TaskPriority {
  low
  medium
  high
}

type Task {
  id: ID!
  title: String!
  description: String!
  completed: Boolean!
  userId: ID!
  priority: TaskPriority!
  dueDate: String
  createdAt: String!
  updatedAt: String!
}

type PaginatedTasks {
  tasks: [Task!]!
  totalCount: Int!
  page: Int!
  limit: Int!
  totalPages: Int!
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
}

type AuthPayload {
  token: String!
  user: User!
}

input RegisterInput {
  name: String!
  email: String!
  password: String!
}

input LoginInput {
  email: String!
  password: String!
}

input TaskFilter {
  completed: Boolean
}

input CreateTaskInput {
  title: String!
  description: String!
  completed: Boolean
  priority: TaskPriority
  dueDate: String
}

input UpdateTaskInput {
  title: String
  description: String
  completed: Boolean
  priority: TaskPriority
  dueDate: String
}
```

**Files**: `server/src/graphql/typeDefs.ts`

**Verify**: `cd server && npm run typecheck` — errors still expected in resolvers (fixed next).

---

## STEP 7 — Update resolvers for new getTasks signature and new Task fields

**What**: Update `getTasksResolver` to accept pagination args, update `Task` resolver to handle `priority`/`dueDate`, update `createTaskResolver` and `updateTaskResolver` to pass new fields.

**Exact changes** in `server/src/resolvers/index.ts`:

1. Update imports — add `GetTasksOptions`, `PaginatedTasksResult` from taskService:
   ```ts
   import {
     createTask,
     getTasksForUser,
     updateTask,
     deleteTask,
     PublicTask,
     CreateTaskInput,
     UpdateTaskInput,
     GetTasksOptions,
     PaginatedTasksResult,
     toPublicTask,
   } from '../services/taskService';
   ```

2. Replace `getTasksResolver`:
   ```ts
   const getTasksResolver = async (
     _parent: unknown,
     args: { page?: number; limit?: number; filter?: { completed?: boolean } },
     context: Context
   ): Promise<PaginatedTasksResult> => {
     const user = requireAuthenticatedUser(context.user);
     const options: GetTasksOptions = {
       page: args.page,
       limit: args.limit,
       filterCompleted: args.filter?.completed,
     };
     return getTasksForUser(user.id, options);
   };
   ```

3. Update the `Task` resolver object — add `priority` and `dueDate`:
   ```ts
   Task: {
     id: (parent: PublicTask): string => parent.id,
     title: (parent: PublicTask): string => parent.title,
     description: (parent: PublicTask): string => parent.description,
     completed: (parent: PublicTask): boolean => parent.completed,
     userId: (parent: PublicTask): string => parent.userId,
     priority: (parent: PublicTask): string => parent.priority,
     dueDate: (parent: PublicTask): string | null =>
       parent.dueDate instanceof Date ? parent.dueDate.toISOString() : null,
     createdAt: (parent: PublicTask): string =>
       parent.createdAt instanceof Date
         ? parent.createdAt.toISOString()
         : String(parent.createdAt),
     updatedAt: (parent: PublicTask): string =>
       parent.updatedAt instanceof Date
         ? parent.updatedAt.toISOString()
         : String(parent.updatedAt),
   },
   ```

4. Add a `PaginatedTasks` resolver to pass through sub-fields (Apollo needs it since the return type is now an object):
   ```ts
   PaginatedTasks: {
     tasks: (parent: PaginatedTasksResult): PublicTask[] => parent.tasks,
     totalCount: (parent: PaginatedTasksResult): number => parent.totalCount,
     page: (parent: PaginatedTasksResult): number => parent.page,
     limit: (parent: PaginatedTasksResult): number => parent.limit,
     totalPages: (parent: PaginatedTasksResult): number => parent.totalPages,
     hasNextPage: (parent: PaginatedTasksResult): boolean => parent.hasNextPage,
     hasPreviousPage: (parent: PaginatedTasksResult): boolean => parent.hasPreviousPage,
   },
   ```

   Add `PaginatedTasks` to the exported `resolvers` object alongside `Task` and `User`.

**Files**: `server/src/resolvers/index.ts`

**Verify**: `cd server && npm run typecheck` — zero errors.

---

## STEP 8 — Create `client/.env`

**What**: The client has no `.env` file. `client.ts` reads `VITE_GRAPHQL_URL`. Create the env file so the Apollo client connects to the correct server URL.

**Create file** `client/.env`:
```
VITE_API_URL=http://localhost:4000
VITE_GRAPHQL_URL=http://localhost:4000/graphql
```

**Files**: `client/.env` (new file)

**Verify**: File exists; `npm run build` (client) doesn't warn about missing env.

---

## STEP 9 — Update client TypeScript types

**What**: Add `priority`, `dueDate`, updated `CreateTaskInput`, `UpdateTaskInput` to `client/src/types/task.ts`. Also add a `PaginatedTasks` type.

**Replace entire file** `client/src/types/task.ts`:
```ts
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  userId: string;
  priority: TaskPriority;
  dueDate?: string | null;  // ISO string or null
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  completed?: boolean;
  priority?: TaskPriority;
  dueDate?: string;  // ISO string
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: TaskPriority;
  dueDate?: string | null;  // null to clear
}

export interface PaginatedTasks {
  tasks: Task[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

**Files**: `client/src/types/task.ts`

**Verify**: `cd client && npm run typecheck` — will show errors in graphql/tasks.ts and pages until those are updated (fixed in following steps).

---

## STEP 10 — Update client GraphQL queries/mutations

**What**: Add `priority`, `dueDate` to all task fragments in `client/src/graphql/tasks.ts`. Update `GET_TASKS_QUERY` to accept pagination variables and return `PaginatedTasks`.

**Replace entire file** `client/src/graphql/tasks.ts`:
```ts
import { gql } from '@apollo/client';

// Shared task fields fragment
const TASK_FIELDS = `
  id
  title
  description
  completed
  userId
  priority
  dueDate
  createdAt
  updatedAt
`;

export const GET_TASKS_QUERY = gql`
  query GetTasks($page: Int, $limit: Int, $filter: TaskFilter) {
    getTasks(page: $page, limit: $limit, filter: $filter) {
      tasks {
        ${TASK_FIELDS}
      }
      totalCount
      page
      limit
      totalPages
      hasNextPage
      hasPreviousPage
    }
  }
`;

export const SEARCH_TASKS_QUERY = gql`
  query SearchTasks($query: String!) {
    searchTasks(query: $query) {
      ${TASK_FIELDS}
    }
  }
`;

export const CREATE_TASK_MUTATION = gql`
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      ${TASK_FIELDS}
    }
  }
`;

export const UPDATE_TASK_MUTATION = gql`
  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
    updateTask(id: $id, input: $input) {
      ${TASK_FIELDS}
    }
  }
`;

export const DELETE_TASK_MUTATION = gql`
  mutation DeleteTask($id: ID!) {
    deleteTask(id: $id)
  }
`;
```

**Files**: `client/src/graphql/tasks.ts`

**Verify**: `cd client && npm run typecheck` — errors only from Dashboard.tsx (fixed later).

---

## STEP 11 — Create `client/src/components/LoadingSpinner.tsx`

**What**: Simple reusable spinner component used by Dashboard, TaskModal, and auth pages.

**Create file** `client/src/components/LoadingSpinner.tsx`:
```tsx
import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  fullScreen?: boolean;
}

const sizeMap = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' } as const;

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  message,
  fullScreen = false,
}) => {
  const icon = <Loader2 className={`${sizeMap[size]} text-primary-400 animate-spin`} />;

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          {icon}
          {message && <p className="text-slate-400 mt-4">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2">
      {icon}
      {message && <span className="text-slate-400 text-sm">{message}</span>}
    </div>
  );
};

export default LoadingSpinner;
```

**Files**: `client/src/components/LoadingSpinner.tsx` (new)

**Verify**: `cd client && npm run typecheck` — no errors in this file.

---

## STEP 12 — Create `client/src/components/EmptyState.tsx`

**What**: Reusable empty-state display used by Dashboard when no tasks match.

**Create file** `client/src/components/EmptyState.tsx`:
```tsx
import React from 'react';
import { CheckSquare } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => (
  <div className="text-center py-16">
    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface border border-border mb-4">
      <CheckSquare className="w-8 h-8 text-slate-500" />
    </div>
    <p className="text-slate-300 text-lg font-medium mb-2">{title}</p>
    {description && <p className="text-slate-500 text-sm mb-4">{description}</p>}
    {action && (
      <button
        onClick={action.onClick}
        className="text-primary-400 hover:text-primary-300 font-medium text-sm transition-colors"
      >
        {action.label}
      </button>
    )}
  </div>
);

export default EmptyState;
```

**Files**: `client/src/components/EmptyState.tsx` (new)

**Verify**: `cd client && npm run typecheck` — no errors.

---

## STEP 13 — Create `client/src/components/PriorityBadge.tsx`

**What**: Displays a colored badge for task priority (high=red, medium=yellow, low=green). Used by TaskCard and TaskModal.

**Create file** `client/src/components/PriorityBadge.tsx`:
```tsx
import React from 'react';
import { TaskPriority } from '../types/task';

interface PriorityBadgeProps {
  priority: TaskPriority;
  size?: 'sm' | 'md';
}

const config: Record<TaskPriority, { label: string; classes: string }> = {
  high:   { label: 'High',   classes: 'bg-red-500/15 text-red-400 border-red-500/30' },
  medium: { label: 'Medium', classes: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  low:    { label: 'Low',    classes: 'bg-green-500/15 text-green-400 border-green-500/30' },
};

const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, size = 'sm' }) => {
  const { label, classes } = config[priority];
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${sizeClasses} ${classes}`}>
      {label}
    </span>
  );
};

export default PriorityBadge;
```

**Files**: `client/src/components/PriorityBadge.tsx` (new)

**Verify**: `cd client && npm run typecheck` — no errors.

---

## STEP 14 — Create `client/src/components/TaskCard.tsx`

**What**: Extracts the individual task display from Dashboard.tsx into its own component. Shows title, description, priority badge, dueDate, and action buttons (toggle complete, edit, delete). Receives callbacks from Dashboard.

**Create file** `client/src/components/TaskCard.tsx`:
```tsx
import React from 'react';
import { Calendar, Edit2, Trash2, Check } from 'lucide-react';
import { Task } from '../types/task';
import PriorityBadge from './PriorityBadge';

interface TaskCardProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onToggleComplete, onEdit, onDelete }) => {
  const dueDateObj = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue =
    dueDateObj !== null &&
    !task.completed &&
    dueDateObj.getTime() < Date.now();

  return (
    <div
      className={`bg-surface border rounded-xl p-4 lg:p-5 transition-all hover:border-primary-500/30 ${
        task.completed ? 'opacity-60 border-border' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Completion toggle */}
        <button
          onClick={() => onToggleComplete(task)}
          className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
            task.completed
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-slate-500 hover:border-primary-500'
          }`}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {task.completed && <Check className="w-4 h-4" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3
              className={`text-base lg:text-lg font-semibold leading-snug ${
                task.completed ? 'line-through text-slate-500' : 'text-slate-100'
              }`}
            >
              {task.title}
            </h3>
            <PriorityBadge priority={task.priority} />
          </div>

          <p
            className={`text-sm text-slate-400 leading-relaxed ${
              task.completed ? 'line-through' : ''
            }`}
          >
            {task.description}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(task.createdAt).toLocaleDateString()}
            </span>
            {dueDateObj !== null && (
              <span
                className={`flex items-center gap-1 ${
                  isOverdue ? 'text-red-400' : 'text-slate-400'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Due: {dueDateObj.toLocaleDateString()}
                {isOverdue && ' (overdue)'}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => onEdit(task)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            aria-label="Edit task"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            aria-label="Delete task"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
```

**Files**: `client/src/components/TaskCard.tsx` (new)

**Verify**: `cd client && npm run typecheck` — no errors.

---

## STEP 15 — Create `client/src/components/TaskModal.tsx`

**What**: A modal dialog for creating and editing tasks. Supports title, description, priority selector, dueDate picker, and completed checkbox. Used by Dashboard.

**Props interface**:
```ts
interface TaskModalProps {
  mode: 'create' | 'edit';
  initialValues?: {
    title: string;
    description: string;
    priority: TaskPriority;
    dueDate?: string | null;
    completed?: boolean;
  };
  onSubmit: (input: CreateTaskInput | UpdateTaskInput) => void;
  onClose: () => void;
  isLoading?: boolean;
}
```

**Create file** `client/src/components/TaskModal.tsx`:
```tsx
import React, { useState, useEffect } from 'react';
import { X, Save, Plus } from 'lucide-react';
import { Task, TaskPriority, CreateTaskInput, UpdateTaskInput } from '../types/task';

interface TaskModalProps {
  mode: 'create' | 'edit';
  initialValues?: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'dueDate' | 'completed'>>;
  onSubmit: (input: CreateTaskInput | UpdateTaskInput) => void;
  onClose: () => void;
  isLoading?: boolean;
}

const TaskModal: React.FC<TaskModalProps> = ({
  mode,
  initialValues,
  onSubmit,
  onClose,
  isLoading = false,
}) => {
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(initialValues?.priority ?? 'medium');
  // dueDate input uses "yyyy-MM-dd" format for <input type="date">
  const [dueDate, setDueDate] = useState(() => {
    if (!initialValues?.dueDate) return '';
    const d = new Date(initialValues.dueDate);
    return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  });

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: CreateTaskInput | UpdateTaskInput =
      mode === 'create'
        ? {
            title: title.trim(),
            description: description.trim(),
            priority,
            dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          }
        : {
            title: title.trim(),
            description: description.trim(),
            priority,
            dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          };
    onSubmit(input);
  };

  const priorityOptions: { value: TaskPriority; label: string; classes: string }[] = [
    { value: 'low',    label: 'Low',    classes: 'text-green-400 border-green-500/40 data-[active=true]:bg-green-500/15' },
    { value: 'medium', label: 'Medium', classes: 'text-yellow-400 border-yellow-500/40 data-[active=true]:bg-yellow-500/15' },
    { value: 'high',   label: 'High',   classes: 'text-red-400 border-red-500/40 data-[active=true]:bg-red-500/15' },
  ];

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal panel */}
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-slate-100">
            {mode === 'create' ? 'New Task' : 'Edit Task'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={120}
              placeholder="Task title..."
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 text-slate-100 placeholder-slate-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              minLength={3}
              maxLength={2000}
              rows={3}
              placeholder="Task description..."
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 text-slate-100 placeholder-slate-500 resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Priority</label>
            <div className="flex gap-2">
              {priorityOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  data-active={priority === opt.value}
                  onClick={() => setPriority(opt.value)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${opt.classes} ${
                    priority === opt.value
                      ? 'bg-opacity-100 opacity-100'
                      : 'opacity-60 hover:opacity-80'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Due Date <span className="text-slate-500">(optional)</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 text-slate-100 [color-scheme:dark]"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mode === 'create' ? <Plus className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {isLoading ? 'Saving...' : mode === 'create' ? 'Create Task' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-background hover:bg-slate-700/50 text-slate-300 rounded-lg transition-colors font-medium border border-border"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;
```

**Files**: `client/src/components/TaskModal.tsx` (new)

**Verify**: `cd client && npm run typecheck` — no errors.

---

## STEP 16 — Create `client/src/components/SearchBar.tsx`

**What**: Debounced search input that calls `SEARCH_TASKS_QUERY` via Apollo `useLazyQuery`. Returns results to parent via `onResults` callback. Falls back to empty array on error. 300ms debounce.

**Create file** `client/src/components/SearchBar.tsx`:
```tsx
import React, { useState, useEffect, useRef } from 'react';
import { useLazyQuery } from '@apollo/client';
import { Search, X, Loader2 } from 'lucide-react';
import { SEARCH_TASKS_QUERY } from '../graphql/tasks';
import { Task } from '../types/task';

interface SearchBarProps {
  onResults: (tasks: Task[] | null) => void; // null = no active search
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  onResults,
  placeholder = 'Search tasks...',
}) => {
  const [query, setQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [runSearch, { loading }] = useLazyQuery<{ searchTasks: Task[] }>(
    SEARCH_TASKS_QUERY,
    {
      onCompleted: (data) => onResults(data.searchTasks),
      onError: () => onResults([]),
    }
  );

  useEffect(() => {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      onResults(null); // clear search mode
      return;
    }
    debounceTimer.current = setTimeout(() => {
      void runSearch({ variables: { query: trimmed } });
    }, 300);
    return () => {
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    };
  }, [query, onResults, runSearch]);

  const clear = () => {
    setQuery('');
    onResults(null);
  };

  return (
    <div className="relative flex-1 max-w-md w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-2.5 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 text-slate-100 placeholder-slate-500 text-sm"
        aria-label="Search tasks"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400 animate-spin" />
      )}
      {!loading && query.length > 0 && (
        <button
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
```

**Files**: `client/src/components/SearchBar.tsx` (new)

**Verify**: `cd client && npm run typecheck` — no errors.

---

## STEP 17 — Create `client/src/components/Pagination.tsx`

**What**: Renders previous/next buttons and page indicator. Used by Dashboard.

**Create file** `client/src/components/Pagination.tsx`:
```tsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (newPage: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4 mt-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={!hasPreviousPage}
        className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-300 hover:text-white bg-surface border border-border rounded-lg hover:border-primary-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        aria-label="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
        Prev
      </button>

      <span className="text-sm text-slate-400">
        Page <span className="text-slate-100 font-medium">{page}</span> of{' '}
        <span className="text-slate-100 font-medium">{totalPages}</span>
      </span>

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={!hasNextPage}
        className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-300 hover:text-white bg-surface border border-border rounded-lg hover:border-primary-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        aria-label="Next page"
      >
        Next
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default Pagination;
```

**Files**: `client/src/components/Pagination.tsx` (new)

**Verify**: `cd client && npm run typecheck` — no errors.

---

## STEP 18 — Create `client/src/components/Navbar.tsx`

**What**: Extracts the header (desktop + mobile) from Dashboard into a reusable Navbar component.

**Props**:
```ts
interface NavbarProps {
  userName: string;
  activeCount: number;
  completedCount: number;
  totalCount: number;
  onLogout: () => void;
}
```

**Create file** `client/src/components/Navbar.tsx`:
```tsx
import React, { useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';

interface NavbarProps {
  userName: string;
  activeCount: number;
  completedCount: number;
  totalCount: number;
  onLogout: () => void;
}

const Navbar: React.FC<NavbarProps> = ({
  userName,
  activeCount,
  completedCount,
  totalCount,
  onLogout,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden border-b border-border bg-surface/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-xl font-bold bg-gradient-to-r from-primary-400 to-primary-300 bg-clip-text text-transparent">
            KoderTroop
          </span>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 text-slate-300 hover:text-white transition-colors"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="border-t border-border px-4 py-4 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div><span className="text-primary-400 font-semibold">{activeCount}</span><div className="text-slate-500 text-xs">active</div></div>
              <div><span className="text-green-400 font-semibold">{completedCount}</span><div className="text-slate-500 text-xs">done</div></div>
              <div><span className="text-slate-300 font-semibold">{totalCount}</span><div className="text-slate-500 text-xs">total</div></div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 text-sm">{userName}</span>
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Desktop Header */}
      <header className="hidden lg:block border-b border-border bg-surface/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between max-w-7xl">
          <div className="flex items-center gap-10">
            <span className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-primary-300 bg-clip-text text-transparent">
              KoderTroop
            </span>
            <div className="flex items-center gap-6 text-sm">
              <span className="text-slate-400"><span className="text-primary-400 font-semibold">{activeCount}</span> active</span>
              <span className="text-slate-400"><span className="text-green-400 font-semibold">{completedCount}</span> completed</span>
              <span className="text-slate-400"><span className="text-slate-300 font-semibold">{totalCount}</span> total</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-slate-300 text-sm">{userName}</span>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors border border-transparent hover:border-border"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>
    </>
  );
};

export default Navbar;
```

**Files**: `client/src/components/Navbar.tsx` (new)

**Verify**: `cd client && npm run typecheck` — no errors.

---

## STEP 19 — Rewrite `client/src/pages/Dashboard.tsx`

**What**: Full rewrite using all new components. Uses `TaskModal` for create/edit, `SearchBar` for debounced search, `Pagination` for page navigation, `TaskCard` for task display, `Navbar` for header, `EmptyState` for empty states, `LoadingSpinner` for loading. Adds priority-based sorting and filter-by-priority options. `GET_TASKS_QUERY` now returns `PaginatedTasks`, so query result shape changes.

**State managed in Dashboard**:
- `currentPage: number` (1-indexed, default 1)
- `pageSize: number` (default 10)
- `filterCompleted: boolean | undefined`
- `filterPriority: TaskPriority | 'all'` (client-side filter applied after fetch)
- `sortType: 'date-desc' | 'date-asc' | 'title-asc' | 'priority-high' | 'priority-low'`
- `searchResults: Task[] | null` (null = not in search mode)
- `showModal: boolean`
- `editingTask: Task | null`
- `showFilterMenu: boolean`

**Query variables**: `{ page: currentPage, limit: pageSize, filter: filterCompleted !== undefined ? { completed: filterCompleted } : undefined }`

**Data source logic**:
- When `searchResults !== null`, display `searchResults` (no pagination shown)
- When `searchResults === null`, display `paginatedData.tasks` from `GET_TASKS_QUERY` response with `Pagination`

**Key implementation notes**:
- Import path `../graphql/tasks` for queries
- Import type `{ PaginatedTasks, Task, TaskPriority, CreateTaskInput, UpdateTaskInput }` from `../types/task`
- `useQuery<{ getTasks: PaginatedTasks }>(GET_TASKS_QUERY, { variables: { page: currentPage, limit: pageSize, filter: filterCompleted !== undefined ? { completed: filterCompleted } : undefined } })`
- On create mutation completed: call `refetch()` and reset `currentPage` to 1
- On update mutation completed: call `refetch()`
- On delete mutation completed: call `refetch()`, if deleted task was last on page and page > 1, set `currentPage(p => p - 1)`
- `filteredAndSorted` derived from `(searchResults ?? data?.getTasks.tasks ?? [])` after applying `filterPriority` and `sortType`
- Priority sort: `priority-high` sorts high→medium→low by mapping to numeric weight (high=0, medium=1, low=2)
- Stats (activeCount, completedCount, totalCount) come from `data?.getTasks.totalCount` and the task array; when in search mode, derive stats from `searchResults`

**Exact filter/sort options to add to the filter dropdown**:
```
--- Status ---
All Tasks
Active
Completed
--- Priority ---
All Priorities
High Priority
Medium Priority
Low Priority
--- Sort ---
Newest First
Oldest First
By Title A→Z
Priority: High First
Priority: Low First
```

**Typecheck traps to avoid**:
- `data?.getTasks` is now `PaginatedTasks`, not `Task[]` — update all references to use `data.getTasks.tasks`
- `filterCompleted` passed to `filter` variable must use `{ completed: filterCompleted }` shape matching `TaskFilter` input type
- `useMutation` callbacks with `onCompleted`/`onError` — type `err` as `{ message?: string }`

**Files**: `client/src/pages/Dashboard.tsx` (full rewrite)

**Verify**: `cd client && npm run typecheck` — zero errors.

---

## STEP 20 — Upgrade `client/src/pages/Login.tsx` — glassmorphism + show/hide password

**What**: Keep all logic but upgrade visual design with glassmorphism card, animated background gradient, and an eye icon toggle for the password field.

**Exact changes**:
1. Add `Eye`, `EyeOff` to lucide-react imports
2. Add state: `const [showPassword, setShowPassword] = useState(false);`
3. Change outer wrapper from `bg-background` to a gradient with glassmorphism card:
   - Outer: `min-h-screen bg-gradient-to-br from-background via-slate-900 to-primary-900/20 flex items-center justify-center px-4`
   - Card div: replace `bg-surface border border-border rounded-xl p-6` with `bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl`
4. Password input: change `type="password"` to `type={showPassword ? 'text' : 'password'}`, wrap in a relative div, add the toggle button:
   ```tsx
   <div className="relative">
     <input
       ...
       type={showPassword ? 'text' : 'password'}
       className="... pr-12" // add right padding for the icon
     />
     <button
       type="button"
       onClick={() => setShowPassword((v) => !v)}
       className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
       aria-label={showPassword ? 'Hide password' : 'Show password'}
     >
       {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
     </button>
   </div>
   ```

**Files**: `client/src/pages/Login.tsx`

**Verify**: `cd client && npm run typecheck` — zero errors.

---

## STEP 21 — Upgrade `client/src/pages/Register.tsx` — glassmorphism + show/hide password

**What**: Same visual treatment as Login. Show/hide toggle on the password field only.

**Exact changes**: Same pattern as Step 20 — add `Eye`/`EyeOff` import, `showPassword` state, wrap password field in relative div with eye toggle, update outer + card styling.

**Files**: `client/src/pages/Register.tsx`

**Verify**: `cd client && npm run typecheck` — zero errors.

---

## STEP 22 — Final full typecheck on both workspaces

**What**: Run the TypeScript compiler with `--noEmit` on both server and client to confirm zero errors end-to-end.

**Files**: none — verification step only

**Verify**:
```
cd c:\Users\sujan\OneDrive\Desktop\task\server && npm run typecheck
cd c:\Users\sujan\OneDrive\Desktop\task\client && npm run typecheck
```
Both must report 0 errors.

---

## TypeScript traps summary (for coder reference)

| Location | Trap |
|---|---|
| `taskService.ts` `UpdateTaskInput.dueDate` | Must type as `string \| null \| undefined` — `null` = clear the field, `undefined` = not provided |
| `resolvers/index.ts` `getTasksResolver` | Return type must be `Promise<PaginatedTasksResult>` not `Promise<PublicTask[]>` |
| `cacheService.ts` `result.push(...)` | Must include `priority` and `dueDate` — TS will error if `PublicTask` has them but push omits them |
| `Dashboard.tsx` query result | `data.getTasks` is `PaginatedTasks`, tasks are at `data.getTasks.tasks` |
| `Dashboard.tsx` stats | `totalCount` comes from `data.getTasks.totalCount`; active/completed must be counted from `data.getTasks.tasks` array locally |
| `SearchBar.tsx` debounce ref | Use `useRef<ReturnType<typeof setTimeout> \| null>(null)` — avoids `NodeJS.Timeout` vs `number` conflict |
| `TaskModal.tsx` dueDate clear | In `edit` mode send `dueDate: null` to clear; in `create` mode omit the field (send `undefined`) |
| `resolvers/index.ts` `PaginatedTasks` resolver | Must be added to the exported `resolvers` object; Apollo will not resolve sub-fields without it |

---

## Order dependencies

```
Steps 1-4 (backend model/service/cache/search) must be done before Step 5 (pagination).
Steps 5-6 (pagination service + typeDefs) must be done before Step 7 (resolvers).
Step 7 completes backend — server typechecks clean.
Step 8 (client .env) is independent, do it any time before running the client.
Step 9 (client types) must be done before Steps 10-19.
Step 10 (GQL queries) must be done before Step 19 (Dashboard rewrite).
Steps 11-18 (new components) must all be done before Step 19 (Dashboard).
Steps 20-21 (Login/Register upgrade) are independent of Dashboard work.
Step 22 (final typecheck) last.
```
