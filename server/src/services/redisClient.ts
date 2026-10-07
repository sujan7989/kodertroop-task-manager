import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { logger } from '../utils/logger';

const socketConfig = {
  host: config.redis.host,
  port: config.redis.port,
};

const password =
  config.redis.password.length > 0 ? config.redis.password : undefined;

export const redisClient: RedisClientType = createClient({
  socket: socketConfig,
  password,
});

let _ready = false;

redisClient.on('error', (err: unknown) => {
  _ready = false;
  logger.error('Redis client error', { error: err instanceof Error ? err.message : String(err) });
});

redisClient.on('ready', () => {
  _ready = true;
  logger.info('Redis client ready');
});

redisClient.on('end', () => {
  _ready = false;
});

export const isRedisReady = (): boolean => _ready;

export const connectRedis = async (): Promise<void> => {
  try {
    if (isRedisReady()) return;
    await redisClient.connect();
    _ready = true;
    logger.info('Redis client connected', {
      host: config.redis.host,
      port: config.redis.port,
    });
  } catch (err) {
    _ready = false;
    logger.error('Redis client failed to connect (operating in degraded mode)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export const disconnectRedis = async (): Promise<void> => {
  try {
    if (isRedisReady()) {
      await redisClient.quit();
      _ready = false;
      logger.info('Redis client disconnected gracefully');
    }
  } catch (err) {
    logger.error('Redis client disconnect error (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
