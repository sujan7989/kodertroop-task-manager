import type { PublicTask } from './taskService';
import { esClient, isElasticReady } from './elasticsearchClient';
import { logger } from '../utils/logger';
import { UnavailableError } from '../errors/AppError';

export const TASKS_INDEX = 'tasks';

const statusCodeFromErr = (err: unknown): number | undefined => {
  if (err === null || err === undefined) return undefined;
  const rec = err as { meta?: { statusCode?: unknown }; statusCode?: unknown };
  if (typeof rec.meta?.statusCode === 'number') return rec.meta.statusCode;
  if (typeof rec.statusCode === 'number') return rec.statusCode;
  return undefined;
};

export const ensureTasksIndex = async (): Promise<void> => {
  if (!isElasticReady()) return;
  try {
    const exists = await esClient.indices.exists({ index: TASKS_INDEX });
    if (exists) {
      logger.info('Elasticsearch tasks index already exists', { index: TASKS_INDEX });
      return;
    }
    await esClient.indices.create({
      index: TASKS_INDEX,
      mappings: {
        properties: {
          title:       { type: 'text', analyzer: 'standard' },
          description: { type: 'text', analyzer: 'standard' },
          userId:      { type: 'keyword' },
          completed:   { type: 'boolean' },
          priority:    { type: 'keyword' },
          dueDate:     { type: 'date' },
          createdAt:   { type: 'date' },
          updatedAt:   { type: 'date' },
        },
      },
      settings: {
        number_of_shards:   1,
        number_of_replicas: 0,
        refresh_interval:   '1s',
      },
    });
    logger.info('Elasticsearch tasks index created successfully', { index: TASKS_INDEX });
  } catch (err) {
    const code = statusCodeFromErr(err);
    if (code === 400) {
      logger.info('Elasticsearch tasks index already exists', { index: TASKS_INDEX });
      return;
    }
    logger.error('Elasticsearch ensureTasksIndex failed (non-fatal)', {
      index: TASKS_INDEX,
      code,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

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

export const indexTask = async (task: PublicTask): Promise<void> => {
  if (!isElasticReady()) return;
  try {
    await esClient.index({
      index: TASKS_INDEX,
      id: task.id,
      document: documentFromTask(task),
    });
  } catch (err) {
    logger.error('Elasticsearch indexTask failed (non-fatal)', {
      taskId: task.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export const updateTaskIndex = async (task: PublicTask): Promise<void> => {
  if (!isElasticReady()) return;
  try {
    await esClient.index({
      index: TASKS_INDEX,
      id: task.id,
      document: documentFromTask(task),
    });
  } catch (err) {
    logger.error('Elasticsearch updateTaskIndex failed (non-fatal)', {
      taskId: task.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export const removeTaskFromIndex = async (taskId: string): Promise<void> => {
  if (!isElasticReady()) return;
  try {
    await esClient.delete({
      index: TASKS_INDEX,
      id: taskId,
    });
  } catch (err) {
    const code = statusCodeFromErr(err);
    if (code === 404) return;
    logger.error('Elasticsearch removeTaskFromIndex failed (non-fatal)', {
      taskId,
      code,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export interface SearchTaskHit {
  id: string;
}

export const searchTasks = async (userId: string, query: string): Promise<SearchTaskHit[]> => {
  if (!isElasticReady()) {
    throw new UnavailableError('Search service temporarily unavailable');
  }
  try {
    const response = await esClient.search({
      index: TASKS_INDEX,
      size: 50,
      query: {
        bool: {
          filter: [{ term: { userId } }],
          must: [{ multi_match: { query, fields: ['title', 'description'] } }],
        },
      },
    });
    const hits = response.hits.hits;
    const result: SearchTaskHit[] = [];
    for (const hit of hits) {
      if (typeof hit._id === 'string') {
        result.push({ id: hit._id });
      }
    }
    return result;
  } catch (err) {
    logger.error('Elasticsearch searchTasks query failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new UnavailableError('Search service temporarily unavailable');
  }
};
