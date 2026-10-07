import { Client, ClientOptions } from '@elastic/elasticsearch';
import { config } from '../config';
import { logger } from '../utils/logger';

const buildClientOptions = (): ClientOptions => {
  const opts: ClientOptions = { node: config.elasticsearch.node };
  const username = config.elasticsearch.username;
  const password = config.elasticsearch.password;
  if (username.length > 0 && password.length > 0) {
    opts.auth = { username, password };
  }
  return opts;
};

let _client: Client | null = null;
let _connected = false;

const getClient = (): Client => {
  if (_client === null) {
    try {
      _client = new Client(buildClientOptions());
    } catch (err) {
      logger.error('Elasticsearch client construction failed (degraded mode)', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
  return _client;
};

export const esClient: Client = (() => {
  try {
    return getClient();
  } catch {
    const fallback = new Client({ node: 'http://127.0.0.1:9200' });
    _client = fallback;
    return fallback;
  }
})();

export const isElasticReady = (): boolean => _connected;

export const connectElasticsearch = async (): Promise<boolean> => {
  try {
    const ok = await esClient.ping();
    if (ok) {
      _connected = true;
      logger.info('Elasticsearch client connected successfully', {
        node: config.elasticsearch.node,
      });
      return true;
    }
    _connected = false;
    logger.warn('Elasticsearch ping returned false (degraded)', {
      node: config.elasticsearch.node,
    });
    return false;
  } catch (err) {
    _connected = false;
    logger.error('Elasticsearch client failed to connect (degraded mode)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
};

export const disconnectElasticsearch = async (): Promise<void> => {
  try {
    await esClient.close();
    _connected = false;
    logger.info('Elasticsearch client disconnected gracefully');
  } catch (err) {
    logger.error('Elasticsearch client disconnect error (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
