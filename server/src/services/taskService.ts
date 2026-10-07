import mongoose, { Types } from 'mongoose';
import { TaskModel, TaskDocument } from '../models/Task';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import {
  getCachedTasks,
  setCachedTasks,
  invalidateTasksCache,
} from './cacheService';
import {
  indexTask,
  updateTaskIndex,
  removeTaskFromIndex,
} from './searchService';

export interface PublicTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  userId: string;
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  completed?: boolean;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string; // ISO string
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string | null; // null means clear
}

export interface GetTasksOptions {
  page?: number;   // 1-indexed, default 1
  limit?: number;  // default 20, max 100
  filterCompleted?: boolean; // undefined = all
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

const TITLE_MIN = 3;
const TITLE_MAX = 120;
const DESCRIPTION_MIN = 3;
const DESCRIPTION_MAX = 2000;
const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;

const isNonWhitespaceStringWithLength = (
  value: unknown,
  min: number,
  max: number
): value is string => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max;
};

const validateTaskId = (id: string): void => {
  if (typeof id !== 'string') {
    throw new BadRequestError('Task id must be a string');
  }
  if (!mongoose.isValidObjectId(id)) {
    throw new BadRequestError('Task id is not a valid identifier');
  }
};

const validateCreateInput = (input: CreateTaskInput): void => {
  if (!isNonWhitespaceStringWithLength(input.title, TITLE_MIN, TITLE_MAX)) {
    throw new BadRequestError(
      `Title must be between ${TITLE_MIN} and ${TITLE_MAX} characters`
    );
  }
  if (
    !isNonWhitespaceStringWithLength(
      input.description,
      DESCRIPTION_MIN,
      DESCRIPTION_MAX
    )
  ) {
    throw new BadRequestError(
      `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters`
    );
  }
  if (input.completed !== undefined && typeof input.completed !== 'boolean') {
    throw new BadRequestError('Completed must be a boolean');
  }
  if (
    input.priority !== undefined &&
    !(VALID_PRIORITIES as readonly string[]).includes(input.priority)
  ) {
    throw new BadRequestError('Priority must be low, medium, or high');
  }
  if (input.dueDate !== undefined) {
    const parsed = new Date(input.dueDate);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestError('dueDate must be a valid ISO date string');
    }
  }
};

const validateUpdateInput = (input: UpdateTaskInput): void => {
  if (Object.keys(input).length === 0) {
    throw new BadRequestError('At least one field is required for update');
  }
  if (input.title !== undefined) {
    if (
      !isNonWhitespaceStringWithLength(input.title, TITLE_MIN, TITLE_MAX)
    ) {
      throw new BadRequestError(
        `Title must be between ${TITLE_MIN} and ${TITLE_MAX} characters`
      );
    }
  }
  if (input.description !== undefined) {
    if (
      !isNonWhitespaceStringWithLength(
        input.description,
        DESCRIPTION_MIN,
        DESCRIPTION_MAX
      )
    ) {
      throw new BadRequestError(
        `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters`
      );
    }
  }
  if (input.completed !== undefined && typeof input.completed !== 'boolean') {
    throw new BadRequestError('Completed must be a boolean');
  }
  if (
    input.priority !== undefined &&
    !(VALID_PRIORITIES as readonly string[]).includes(input.priority)
  ) {
    throw new BadRequestError('Priority must be low, medium, or high');
  }
  if (input.dueDate !== undefined && input.dueDate !== null) {
    const parsed = new Date(input.dueDate);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestError('dueDate must be a valid ISO date string');
    }
  }
};

export const createTask = async (
  userId: string,
  input: CreateTaskInput
): Promise<PublicTask> => {
  validateCreateInput(input);
  if (!mongoose.isValidObjectId(userId)) {
    throw new BadRequestError('User id is invalid');
  }
  const created = await TaskModel.create({
    title: input.title,
    description: input.description,
    completed: typeof input.completed === 'boolean' ? input.completed : false,
    userId: new Types.ObjectId(userId),
    priority: input.priority ?? 'medium',
    dueDate: input.dueDate !== undefined ? new Date(input.dueDate) : undefined,
  });
  const publicTask = toPublicTask(created);
  await invalidateTasksCache(userId);
  await indexTask(publicTask);
  return publicTask;
};

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
    // Re-fetch full list for cache storage
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

const findOwnedTaskOrNotFound = async (
  userId: string,
  taskId: string
): Promise<TaskDocument> => {
  validateTaskId(taskId);
  if (!mongoose.isValidObjectId(userId)) {
    throw new BadRequestError('User id is invalid');
  }
  const doc = await TaskModel.findOne({
    _id: new Types.ObjectId(taskId),
    userId: new Types.ObjectId(userId),
  }).exec();
  if (doc === null) {
    throw new NotFoundError('Task not found');
  }
  return doc;
};

export const updateTask = async (
  userId: string,
  taskId: string,
  input: UpdateTaskInput
): Promise<PublicTask> => {
  const doc = await findOwnedTaskOrNotFound(userId, taskId);
  validateUpdateInput(input);
  if (input.title !== undefined) {
    doc.title = input.title;
  }
  if (input.description !== undefined) {
    doc.description = input.description;
  }
  if (input.completed !== undefined) {
    doc.completed = input.completed;
  }
  if (input.priority !== undefined) {
    doc.priority = input.priority;
  }
  if (input.dueDate !== undefined) {
    doc.dueDate = input.dueDate === null ? undefined : new Date(input.dueDate);
  }
  const saved = await doc.save();
  const savedPublic = toPublicTask(saved);
  await invalidateTasksCache(userId);
  await updateTaskIndex(savedPublic);
  return savedPublic;
};

export const deleteTask = async (
  userId: string,
  taskId: string
): Promise<void> => {
  const doc = await findOwnedTaskOrNotFound(userId, taskId);
  await TaskModel.deleteOne({
    _id: doc._id,
    userId: new Types.ObjectId(userId),
  }).exec();
  await invalidateTasksCache(userId);
  await removeTaskFromIndex(taskId);
};
