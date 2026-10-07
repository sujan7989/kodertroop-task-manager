import mongoose from 'mongoose';
import { config } from './index';
import { logger } from '../utils/logger';

let disconnectHandlerRegistered = false;

const handleShutdown = async (signal: string): Promise<void> => {
  logger.info(`${signal} received — closing MongoDB connection`);
  try {
    await mongoose.disconnect();
    logger.info('MongoDB connection closed gracefully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during MongoDB graceful shutdown', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
};

export const connectDatabase = async (): Promise<void> => {
  try {
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected', {
        uri: `${config.mongodb.uri.replace(/\/\/[^@]*@/, '//***:***@')}`,
        host: mongoose.connection.host,
        db: mongoose.connection.name,
      });
    });

    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    await mongoose.connect(config.mongodb.uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    if (!disconnectHandlerRegistered) {
      process.on('SIGINT', () => handleShutdown('SIGINT').catch(() => process.exit(1)));
      process.on('SIGTERM', () => handleShutdown('SIGTERM').catch(() => process.exit(1)));
      disconnectHandlerRegistered = true;
    }
  } catch (error) {
    logger.error('Failed to establish MongoDB connection', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
};
