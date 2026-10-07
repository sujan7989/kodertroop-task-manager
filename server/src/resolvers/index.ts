import { GraphQLResolveInfo } from 'graphql';
import { Context, Resolver } from '../types';
import mongoose, { Types } from 'mongoose';
import {
  registerUser,
  loginUser,
  PublicUser,
  RegisterInput,
  LoginInput,
} from '../services/authService';
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
import { TaskModel } from '../models/Task';
import { searchTasks as searchTasksService } from '../services/searchService';
import { requireAuthenticatedUser } from '../middleware/auth';
import { BadRequestError } from '../errors/AppError';

interface HealthResult {
  status: string;
  timestamp: string;
}

interface AuthResultGql {
  token: string;
  user: PublicUser;
}

const healthResolver: Resolver<HealthResult> = (): HealthResult => ({
  status: 'OK',
  timestamp: new Date().toISOString(),
});

const registerResolver = async (
  _parent: unknown,
  args: { input: RegisterInput },
  _context: Context,
  _info: GraphQLResolveInfo
): Promise<AuthResultGql> => registerUser(args.input);

const loginResolver = async (
  _parent: unknown,
  args: { input: LoginInput },
  _context: Context,
  _info: GraphQLResolveInfo
): Promise<AuthResultGql> => loginUser(args.input);

const meResolver = (
  _parent: unknown,
  _args: unknown,
  context: Context
): PublicUser | null => {
  if (context.hadToken === true && context.authError !== undefined) {
    throw context.authError;
  }
  if (context.user === undefined) {
    return null;
  }
  return requireAuthenticatedUser(context.user);
};

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

const createTaskResolver = async (
  _parent: unknown,
  args: { input: CreateTaskInput },
  context: Context
): Promise<PublicTask> => {
  const user = requireAuthenticatedUser(context.user);
  return createTask(user.id, args.input);
};

const updateTaskResolver = async (
  _parent: unknown,
  args: { id: unknown; input: UpdateTaskInput },
  context: Context
): Promise<PublicTask> => {
  const user = requireAuthenticatedUser(context.user);
  return updateTask(user.id, String(args.id), args.input);
};

const deleteTaskResolver = async (
  _parent: unknown,
  args: { id: unknown },
  context: Context
): Promise<boolean> => {
  const user = requireAuthenticatedUser(context.user);
  await deleteTask(user.id, String(args.id));
  return true;
};

const searchTasksResolver = async (
  _parent: unknown,
  args: { query: unknown },
  context: Context
): Promise<PublicTask[]> => {
  const user = requireAuthenticatedUser(context.user);
  const rawQuery = args.query;
  if (typeof rawQuery !== 'string') {
    throw new BadRequestError('Search query must be a string');
  }
  const trimmed = rawQuery.trim();
  if (trimmed.length < 2) {
    throw new BadRequestError('Search query must be at least 2 characters');
  }
  const hits = await searchTasksService(user.id, trimmed);
  const hitIds = hits.map((h) => h.id);
  if (hitIds.length === 0) return [];
  const validObjectIdStrings: string[] = [];
  for (const id of hitIds) {
    if (mongoose.isValidObjectId(id)) validObjectIdStrings.push(id);
  }
  if (validObjectIdStrings.length === 0) return [];
  const docs = await TaskModel.find({
    _id: { $in: validObjectIdStrings.map((id) => new Types.ObjectId(id)) },
    userId: new Types.ObjectId(user.id),
  }).exec();
  const byId = new Map<string, PublicTask>();
  for (const doc of docs) {
    byId.set(doc._id.toHexString(), toPublicTask(doc));
  }
  const ordered: PublicTask[] = [];
  for (const id of hitIds) {
    const item = byId.get(id);
    if (item !== undefined) ordered.push(item);
  }
  return ordered;
};

export const resolvers = {
  Query: {
    _health: healthResolver,
    me: meResolver,
    getTasks: getTasksResolver,
    searchTasks: searchTasksResolver,
  },
  Mutation: {
    _health: healthResolver,
    register: registerResolver,
    login: loginResolver,
    createTask: createTaskResolver,
    updateTask: updateTaskResolver,
    deleteTask: deleteTaskResolver,
  },
  User: {
    id: (parent: PublicUser): string => parent.id,
    name: (parent: PublicUser): string => parent.name,
    email: (parent: PublicUser): string => parent.email,
    createdAt: (parent: PublicUser): string =>
      parent.createdAt instanceof Date
        ? parent.createdAt.toISOString()
        : String(parent.createdAt),
    updatedAt: (parent: PublicUser): string =>
      parent.updatedAt instanceof Date
        ? parent.updatedAt.toISOString()
        : String(parent.updatedAt),
  },
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
  PaginatedTasks: {
    tasks: (parent: PaginatedTasksResult): PublicTask[] => parent.tasks,
    totalCount: (parent: PaginatedTasksResult): number => parent.totalCount,
    page: (parent: PaginatedTasksResult): number => parent.page,
    limit: (parent: PaginatedTasksResult): number => parent.limit,
    totalPages: (parent: PaginatedTasksResult): number => parent.totalPages,
    hasNextPage: (parent: PaginatedTasksResult): boolean => parent.hasNextPage,
    hasPreviousPage: (parent: PaginatedTasksResult): boolean => parent.hasPreviousPage,
  },
};
