import express from 'express';
import cors from 'cors';
import { ApolloServer } from 'apollo-server-express';
import { ExpressContext } from 'apollo-server-express/dist/ApolloServer';
import mongoose from 'mongoose';
import { config } from './config';
import { logger } from './utils/logger';
import { typeDefs } from './graphql/typeDefs';
import { resolvers } from './resolvers';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { connectDatabase } from './config/database';
import { buildAuthContext } from './middleware/auth';
import { formatApolloError } from './graphql/formatError';
import {
  connectRedis,
  disconnectRedis,
  isRedisReady,
} from './services/redisClient';
import {
  connectElasticsearch,
  disconnectElasticsearch,
  isElasticReady,
} from './services/elasticsearchClient';
import { ensureTasksIndex } from './services/searchService';

const createContext = (expressContext: ExpressContext) => buildAuthContext(expressContext);

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();
    await connectRedis();
    const elasticOk = await connectElasticsearch();
    if (elasticOk) {
      await ensureTasksIndex();
    }

    const app = express();

    app.use(cors());
    app.use(express.json());

    app.get('/health', (_req, res) => {
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        redis: isRedisReady() ? 'UP' : 'DOWN',
        elasticsearch: isElasticReady() ? 'UP' : 'DOWN',
      });
    });

    const apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      context: createContext,
      formatError: formatApolloError,
    });

    await apolloServer.start();
    apolloServer.applyMiddleware({ app, path: '/graphql' });

    app.use(notFoundHandler);
    app.use(errorHandler);

    const server = app.listen(config.server.port, () => {
      logger.info(`Server is running on port ${config.server.port}`, {
        graphqlEndpoint: `http://localhost:${config.server.port}${apolloServer.graphqlPath}`,
        healthEndpoint: `http://localhost:${config.server.port}/health`,
        nodeEnv: config.server.nodeEnv,
        redis: isRedisReady() ? 'UP' : 'DOWN',
        elasticsearch: isElasticReady() ? 'UP' : 'DOWN',
      });
    });

    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received — initiating graceful shutdown`);
      try {
        server.close(() => logger.info('HTTP server closed'));
      } catch (err) {
        logger.error('HTTP server close error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        await apolloServer.stop();
        logger.info('Apollo Server stopped');
      } catch (err) {
        logger.error('Apollo stop error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        await disconnectRedis();
      } catch (err) {
        logger.error('Redis disconnect error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        await disconnectElasticsearch();
      } catch (err) {
        logger.error('Elasticsearch disconnect error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        if (mongoose.connection.readyState !== 0) {
          await mongoose.disconnect();
          logger.info('MongoDB disconnected');
        }
      } catch (err) {
        logger.error('MongoDB disconnect error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      process.exit(0);
    };

    process.on('SIGTERM', () => {
      void gracefulShutdown('SIGTERM');
    });
    process.on('SIGINT', () => {
      void gracefulShutdown('SIGINT');
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
};

startServer();
