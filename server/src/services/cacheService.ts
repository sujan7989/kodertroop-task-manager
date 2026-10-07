import type { PublicTask } from './taskService';
import { redisClient, isRedisReady } from './redisClient';
import { logger } from '../utils/logger';

export const TASK_CACHE_TTL_SECONDS = 300;

export const taskCacheKey = (userId: string): string => `tasks:user:${userId}`;

const toDateIfIsoString = (value: unknown): Date | unknown => {
  if (typeof value !== 'string') return value;
  if (value.length < 10) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const iso = parsed.toISOString();
  if (iso !== value) {
    const isoNoMs = iso.slice(0, 19) + 'Z';
    if (value !== isoNoMs && value !== iso.slice(0, value.length)) return value;
  }
  return parsed;
};

const deserializeTasks = (raw: string): PublicTask[] | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.error('Cache JSON parse failure (treating as miss)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const result: PublicTask[] = [];
  for (const item of parsed) {
    if (item === null || typeof item !== 'object') return null;
    const rec = item as Record<string, unknown>;
    if (
      typeof rec.id !== 'string' ||
      typeof rec.title !== 'string' ||
      typeof rec.description !== 'string' ||
      typeof rec.completed !== 'boolean' ||
      typeof rec.userId !== 'string'
    ) {
      return null;
    }
    const createdAtRaw = toDateIfIsoString(rec.createdAt);
    const updatedAtRaw = toDateIfIsoString(rec.updatedAt);
    if (!(createdAtRaw instanceof Date) || !(updatedAtRaw instanceof Date)) {
      return null;
    }

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
  }
  return result;
};

export const getCachedTasks = async (userId: string): Promise<PublicTask[] | null> => {
  if (!isRedisReady()) return null;
  try {
    const key = taskCacheKey(userId);
    const raw = await redisClient.get(key);
    if (raw === null || raw === undefined) return null;
    const deserialized = deserializeTasks(raw);
    if (deserialized === null) {
      await redisClient.del(key).catch(() => undefined);
      return null;
    }
    return deserialized;
  } catch (err) {
    logger.error('Redis getCachedTasks failed (falling through to DB)', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
};

export const setCachedTasks = async (userId: string, tasks: PublicTask[]): Promise<void> => {
  if (!isRedisReady()) return;
  try {
    const serialized = JSON.stringify(tasks);
    await redisClient.setEx(taskCacheKey(userId), TASK_CACHE_TTL_SECONDS, serialized);
  } catch (err) {
    logger.error('Redis setCachedTasks failed (non-fatal)', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export const invalidateTasksCache = async (userId: string): Promise<void> => {
  if (!isRedisReady()) return;
  try {
    await redisClient.del(taskCacheKey(userId));
  } catch (err) {
    logger.error('Redis invalidateTasksCache failed (non-fatal)', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
