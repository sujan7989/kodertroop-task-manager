import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Environment variable ${key} is not set`);
};

const getRequiredEnvVar = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
};

const nodeEnv = getEnvVar('NODE_ENV', 'development');
const isTestEnv = nodeEnv === 'test';

export const config = {
  server: {
    port: parseInt(getEnvVar('PORT', '4000'), 10),
    nodeEnv,
    isProduction: nodeEnv === 'production',
  },
  mongodb: {
    uri: getRequiredEnvVar('MONGODB_URI'),
  },
  redis: {
    host: getEnvVar('REDIS_HOST', 'localhost'),
    port: parseInt(getEnvVar('REDIS_PORT', '6379'), 10),
    password: getEnvVar('REDIS_PASSWORD', ''),
  },
  elasticsearch: {
    node: getEnvVar('ELASTICSEARCH_NODE', 'http://localhost:9200'),
    username: getEnvVar('ELASTICSEARCH_USERNAME', ''),
    password: getEnvVar('ELASTICSEARCH_PASSWORD', ''),
  },
  jwt: {
    secret: isTestEnv
      ? getEnvVar('JWT_SECRET', 'test-jwt-secret-change-me')
      : getRequiredEnvVar('JWT_SECRET'),
    expiresIn: getEnvVar('JWT_EXPIRES_IN', '7d'),
  },
};

export type Config = typeof config;
