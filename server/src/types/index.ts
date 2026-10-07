import { PublicUser } from '../services/authService';
import { AppError } from '../errors/AppError';

export interface Context {
  user?: PublicUser;
  hadToken?: boolean;
  authError?: AppError;
}

export type Resolver<T = unknown, Args = Record<string, unknown>> = (
  parent: unknown,
  args: Args,
  context: Context,
  info: unknown
) => T | Promise<T>;

export interface PaginationArgs {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
