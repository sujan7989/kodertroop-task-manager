export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  userId: string;
  priority: TaskPriority;
  dueDate?: string | null; // ISO string or null
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  completed?: boolean;
  priority?: TaskPriority;
  dueDate?: string; // ISO string
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: TaskPriority;
  dueDate?: string | null; // null to clear
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
