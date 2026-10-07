export * from './auth';
export * from './task';

export interface ApiError {
  message: string;
  code?: number;
  extensions?: Record<string, unknown>;
}
