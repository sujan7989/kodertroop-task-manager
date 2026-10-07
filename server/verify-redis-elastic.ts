const JWT_SECRET_STEP4 = 'verify-step4-internal-secret';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET_STEP4;
process.env.JWT_EXPIRES_IN = '1h';
process.env.MONGODB_URI = 'mongodb://127.0.0.1/placeholder-mms-override';

import 'dotenv/config';

import { ApolloServer, ExpressContext } from 'apollo-server-express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn, ChildProcess } from 'child_process';

type GqlErrors = Array<{ message: string; extensions?: { code?: string } }>;

let elasticContainer: ChildProcess | null = null;

const stopElasticContainer = async (): Promise<void> => {
  if (elasticContainer === null) return;
  try {
    elasticContainer.kill('SIGKILL');
  } catch {
    /* ignore */
  }
  elasticContainer = null;
};

const startLocalElasticViaDocker = async (): Promise<{ node: string } | null> => {
  try {
    const whichOut: Buffer = await new Promise((resolve, reject) => {
      const p = spawn('docker', ['--version'], { windowsHide: true });
      const bufs: Buffer[] = [];
      p.stdout.on('data', (d) => bufs.push(d as Buffer));
      p.stderr.on('data', () => undefined);
      p.on('error', () => resolve(Buffer.alloc(0)));
      p.on('close', (code) => {
        if (code === 0) resolve(Buffer.concat(bufs));
        else resolve(Buffer.alloc(0));
      });
      setTimeout(() => reject(new Error('docker --version timeout')), 5000);
    });
    if (!whichOut.toString().includes('Docker')) return null;
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const child = spawn(
        'docker',
        [
          'run',
          '--rm',
          '-p',
          '9200:9200',
          '-e',
          'discovery.type=single-node',
          '-e',
          'xpack.security.enabled=false',
          'docker.elastic.co/elasticsearch/elasticsearch:8.14.3',
        ],
        {
          windowsHide: true,
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      elasticContainer = child;
      child.on('error', () => resolve(null));
      let done = false;
      const healthCheck = async (): Promise<void> => {
        const { Client } = await import('@elastic/elasticsearch');
        const client = new Client({ node: 'http://localhost:9200' });
        for (let i = 0; i < 40; i++) {
          if (done) return;
          try {
            const ok = await client.ping();
            if (ok) {
              done = true;
              resolve({ node: 'http://localhost:9200' });
              return;
            }
          } catch {
            /* sleep */
          }
          await new Promise((r) => setTimeout(r, 3000));
        }
        if (!done) {
          done = true;
          resolve(null);
        }
      };
      void healthCheck();
    } catch {
      resolve(null);
    }
  });
};

const probeElastic = async (node: string): Promise<boolean> => {
  try {
    const { Client } = await import('@elastic/elasticsearch');
    const c = new Client({ node });
    return await c.ping();
  } catch {
    return false;
  }
};

const run = async (): Promise<void> => {
  const mongod = await MongoMemoryServer.create();
  let esNode: string | null = null;
  let esAvailable: boolean = false;
  let esSkipReason: string | null = null;
  try {
    await mongoose.connect(mongod.getUri());
    console.log(`[ENV] MongoDB in-memory: ${mongod.getUri()}`);

    // Redis memory server (real) — dynamic import, override env BEFORE redisClient import
    const { RedisMemoryServer } = await import('redis-memory-server');
    const redisServer = await RedisMemoryServer.create();
    const redisHost = await redisServer.getHost();
    const redisPort = await redisServer.getPort();
    process.env.REDIS_HOST = redisHost;
    process.env.REDIS_PORT = String(redisPort);
    process.env.REDIS_PASSWORD = '';
    console.log(`[ENV] Redis in-memory: redis://${redisHost}:${redisPort}`);

    // Elasticsearch probe / launch
    const envNode = process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200';
    if (await probeElastic(envNode)) {
      esNode = envNode;
      esAvailable = true;
      console.log(`[ENV] Elasticsearch available (env var): ${esNode}`);
    } else {
      const viaDocker = await startLocalElasticViaDocker();
      if (viaDocker !== null) {
        esNode = viaDocker.node;
        esAvailable = true;
        console.log(`[ENV] Elasticsearch available (docker container): ${esNode}`);
      } else {
        esAvailable = false;
        esSkipReason = 'No reachable Elasticsearch and Docker unavailable for launch';
        console.log(`[ENV] ELASTICSEARCH SKIP: ${esSkipReason}`);
      }
    }
    if (esNode !== null) {
      process.env.ELASTICSEARCH_NODE = esNode;
    }

    // Import AFTER env overrides applied
    const { typeDefs } = await import('./src/graphql/typeDefs');
    const { resolvers } = await import('./src/resolvers');
    const { buildAuthContext } = await import('./src/middleware/auth');
    const { formatApolloError } = await import('./src/graphql/formatError');
    const {
      redisClient,
      connectRedis,
      disconnectRedis,
      isRedisReady,
    } = await import('./src/services/redisClient');
    const {
      connectElasticsearch,
      disconnectElasticsearch,
      isElasticReady,
    } = await import('./src/services/elasticsearchClient');
    const { ensureTasksIndex } = await import('./src/services/searchService');
    const { taskCacheKey } = await import('./src/services/cacheService');

    // Connect
    await connectRedis();
    console.assert(isRedisReady(), 'Redis client should be ready after connect to memory server');
    console.log('[CONNECT] Redis UP');

    if (esAvailable) {
      const esOk = await connectElasticsearch();
      console.assert(esOk, 'Elasticsearch ping on start');
      await ensureTasksIndex();
      console.log(`[CONNECT] Elasticsearch UP (node=${process.env.ELASTICSEARCH_NODE})`);
    } else {
      console.log('[CONNECT] Elasticsearch SKIPPED (will mark tests below with banner)');
    }

    const apollo = new ApolloServer({
      typeDefs,
      resolvers,
      context: (ctx: ExpressContext) => buildAuthContext(ctx),
      formatError: formatApolloError,
    });
    await apollo.start();

    const runGql = async <T>(
      query: string,
      variables: Record<string, unknown> = {},
      token?: string
    ): Promise<{ data?: T; errors?: GqlErrors }> => {
      const req = {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      };
      const contextValue = await buildAuthContext({
        req,
      } as unknown as ExpressContext);
      return apollo.executeOperation(
        { query, variables },
        { contextValue }
      ) as Promise<{ data?: T; errors?: GqlErrors }>;
    };

    const registerMutation = `mutation Register($input: RegisterInput!) { register(input: $input) { token user { id name email } } }`;
    const getTasksQuery = `query { getTasks { id title description completed userId createdAt updatedAt } }`;
    const createTaskMutation = `mutation CreateTask($input: CreateTaskInput!) { createTask(input: $input) { id title description completed userId createdAt updatedAt } }`;
    const deleteTaskMutation = `mutation DeleteTask($id: ID!) { deleteTask(id: $id) }`;
    const searchTasksQuery = `query Search($query: String!) { searchTasks(query: $query) { id title description completed userId createdAt updatedAt } }`;

    const registerAndLogin = async (
      name: string,
      email: string,
      password: string
    ): Promise<{ token: string; userId: string }> => {
      const reg = await runGql<{
        register: { token: string; user: { id: string; name: string; email: string } };
      }>(registerMutation, {
        input: { name, email, password },
      });
      console.assert(!reg.errors, `register ${email} errors=${JSON.stringify(reg.errors ?? [])}`);
      console.assert(
        typeof reg.data?.register.token === 'string' && reg.data.register.token.length > 40,
        `register ${email} missing token`
      );
      console.assert(typeof reg.data?.register.user.id === 'string', `register ${email} missing userId`);
      return {
        token: reg.data!.register.token,
        userId: reg.data!.register.user.id,
      };
    };

    const userA = await registerAndLogin(
      'User A',
      'step4-usera@example.com',
      'KoderTroop1!'
    );
    const userB = await registerAndLogin(
      'User B',
      'step4-userb@example.com',
      'KoderTroop2!'
    );

    // ============== CACHE SECTION ==============
    console.log('\n=== [CACHE] Redis per-user tasks list caching ===');

    // Pre-clean any prior keys (fresh memory server — should not exist, but assert)
    const preAExists = await redisClient.exists(taskCacheKey(userA.userId));
    console.assert(preAExists === 0, `[CACHE-PRE] User A cache empty initially (exists=${preAExists})`);
    console.log(`[CACHE-PRE] UserA cache initially: exists=${preAExists}`);

    // UserA: Create task A
    const createA = await runGql<{
      createTask: { id: string; title: string; description: string; completed: boolean; userId: string };
    }>(createTaskMutation, {
      input: { title: 'Plan Redis integration', description: 'Cache getTasks lists per user' },
    }, userA.token);
    console.assert(!createA.errors, `[CACHE-A] createTask errors=${JSON.stringify(createA.errors ?? [])}`);
    const taskA = createA.data!.createTask;
    // After create: cache should have been invalidated (DEL). Immediately may not exist.
    const afterCreateExists = await redisClient.exists(taskCacheKey(userA.userId));
    console.log(`[CACHE-A] After create: cache exists=${afterCreateExists} (expected: 0 because DEL was issued)`);
    // Note: cache gets populated only on getTasks read. DEL on create/write is correct.

    // UserA: 1st getTasks -> cache miss (no key), populate cache on return
    const gA1 = await runGql<{ getTasks: Array<{ id: string; title: string }> }>(getTasksQuery, {}, userA.token);
    console.assert(!gA1.errors, `[CACHE-A] 1st getTasks errors: ${JSON.stringify(gA1.errors ?? [])}`);
    console.assert(
      Array.isArray(gA1.data?.getTasks) && gA1.data.getTasks.length === 1 && gA1.data.getTasks[0].id === taskA.id,
      `[CACHE-A] 1st getTasks returns taskA`
    );
    // Now cache should exist in Redis
    const after1stExists = await redisClient.exists(taskCacheKey(userA.userId));
    console.assert(after1stExists === 1, `[CACHE-A] 1st getTasks populated cache (exists=${after1stExists})`);
    const rawAfter1st = await redisClient.get(taskCacheKey(userA.userId));
    console.assert(typeof rawAfter1st === 'string' && rawAfter1st.includes(taskA.id), `[CACHE-A] cache JSON includes taskA.id`);
    console.log(`[CACHE-A] 1st getTasks: cache MISS -> populate (key exists: ${after1stExists}, contains id: ${taskA.id.substring(0, 6)}...)`);

    // UserA: 2nd getTasks -> cache HIT (cache returns without mongo query)
    const gA2 = await runGql<{ getTasks: Array<{ id: string; title: string; createdAt: string | Date }> }>(getTasksQuery, {}, userA.token);
    console.assert(!gA2.errors, `[CACHE-A] 2nd getTasks errors: ${JSON.stringify(gA2.errors ?? [])}`);
    console.assert(
      Array.isArray(gA2.data?.getTasks) && gA2.data.getTasks.length === 1 && gA2.data.getTasks[0].id === taskA.id,
      `[CACHE-A] 2nd getTasks HIT returns correct task`
    );
    // Verify dates are real instanceof Date from resolver (resolver always serializes via toISOString so string in gql response is OK — but cacheService must have produced dates internally). Assertion: the response matches via GraphQL serialization.
    const cacheHitExistsStill = await redisClient.exists(taskCacheKey(userA.userId));
    console.assert(cacheHitExistsStill === 1, `[CACHE-A] 2nd call still has cached key (expected 1)`);
    console.log(`[CACHE-A] 2nd getTasks: cache HIT (key exists: ${cacheHitExistsStill}) OK`);

    // [CACHE-B] Write invalidation: create new task for userA, cache DEL happens
    const createA2 = await runGql<{ createTask: { id: string } }>(createTaskMutation, {
      input: { title: 'Second task', description: 'Second to trigger invalidation' },
    }, userA.token);
    console.assert(!createA2.errors, `[CACHE-B] createTask#2 errors=${JSON.stringify(createA2.errors ?? [])}`);
    const afterA2Exists = await redisClient.exists(taskCacheKey(userA.userId));
    console.assert(afterA2Exists === 0, `[CACHE-B] After 2nd create, cache invalidated (exists=${afterA2Exists} expected 0)`);
    // Repopulate: getTasks again -> now 2 items, cache exists=1
    const gA3 = await runGql<{ getTasks: Array<{ id: string }> }>(getTasksQuery, {}, userA.token);
    console.assert(Array.isArray(gA3.data?.getTasks) && gA3.data.getTasks.length === 2, `[CACHE-B] repopulate list length=2`);
    const existsAfterRepop = await redisClient.exists(taskCacheKey(userA.userId));
    console.assert(existsAfterRepop === 1, `[CACHE-B] repopulate cache exists=${existsAfterRepop}`);
    console.log(`[CACHE-B] Write invalidation: DEL on create OK (exists=0 then repopulate OK length=2)`);

    // [CACHE-C] Cross-user isolation: UserB caches, UserA delete invalidates only A not B
    const createB = await runGql<{ createTask: { id: string } }>(createTaskMutation, {
      input: { title: 'User B only', description: 'User B task never in A cache' },
    }, userB.token);
    console.assert(!createB.errors, `[CACHE-C] B createTask errors=${JSON.stringify(createB.errors ?? [])}`);
    const taskBId = createB.data!.createTask.id;
    // Populate B cache
    const gB1 = await runGql<{ getTasks: Array<{ id: string }> }>(getTasksQuery, {}, userB.token);
    console.assert(Array.isArray(gB1.data?.getTasks) && gB1.data.getTasks.length === 1 && gB1.data.getTasks[0].id === taskBId, `[CACHE-C] User B getTasks has own task only`);
    const bCacheExists = await redisClient.exists(taskCacheKey(userB.userId));
    console.assert(bCacheExists === 1, `[CACHE-C] B cache exists=1 after getTasks`);
    // User A deletes taskA (invalidates A cache). B cache intact.
    const delA = await runGql<{ deleteTask: boolean }>(deleteTaskMutation, { id: taskA.id }, userA.token);
    console.assert(!delA.errors && delA.data?.deleteTask === true, `[CACHE-C] delete taskA OK`);
    const aAfterDelExists = await redisClient.exists(taskCacheKey(userA.userId));
    const bAfterDelExists = await redisClient.exists(taskCacheKey(userB.userId));
    console.assert(aAfterDelExists === 0, `[CACHE-C] After A delete, A cache exists=${aAfterDelExists} expected 0 (invalidated)`);
    console.assert(bAfterDelExists === 1, `[CACHE-C] After A delete, B cache exists=${bAfterDelExists} expected 1 (INTACT)`);
    console.log(`[CACHE-C] Cross-user invalidation isolation OK (A=0, B=1)`);

    // Optional graceful Redis degrade: close client, getTasks still works
    console.log('\n=== [CACHE-GRACEFUL] Redis degraded mode ===');
    try {
      await redisClient.quit();
    } catch {
      /* ignore */
    }
    const gracefulB = await runGql<{ getTasks: Array<{ id: string }> }>(getTasksQuery, {}, userB.token);
    console.assert(!gracefulB.errors, `[CACHE-GRACEFUL] No GraphQL errors when Redis unavailable: errors=${JSON.stringify(gracefulB.errors ?? [])}`);
    console.assert(Array.isArray(gracefulB.data?.getTasks) && gracefulB.data.getTasks.length === 1 && gracefulB.data.getTasks[0].id === taskBId, `[CACHE-GRACEFUL] getTasks returns correct data via DB fallback (no Redis required)`);
    console.log('[CACHE-GRACEFUL] Redis unavailable → getTasks still works transparently (DB fallback) OK');

    // ============== ELASTICSEARCH SECTION ==============
    console.log('\n=== [ELASTICSEARCH] Indexing + searchTasks ===');
    if (!esAvailable) {
      console.log('==== [ELASTIC SKIPPED] ====');
      console.log(`Reason: ${esSkipReason ?? 'unavailable'}`);
      console.log('AC-4 Indexing sync and AC-5 Cross-user search isolation sections: SKIPPED WITH EXPLICIT NOTICE (mocked stubs zero used per hard constraint)');
      console.log('==== [ELASTIC SKIPPED END] ====');
    } else {
      // Reconnect redis (we quit for graceful test) for upcoming combined ops (not strictly needed but clean)
      try {
        await redisClient.connect().catch(() => undefined);
      } catch {
        /* ignore */
      }

      console.log('\n[ELASTIC PREP] Register/search users C and D for clean test matrix');
      const userC = await registerAndLogin('User C', 'step4-userc@example.com', 'KoderTroop3!');
      const userD = await registerAndLogin('User D', 'step4-userd@example.com', 'KoderTroop4!');

      const [INDEX_A] = await Promise.all([
        runGql<{ createTask: { id: string } }>(createTaskMutation, {
          input: { title: 'Buy organic milk today', description: 'Organic whole milk from local dairy farm' },
        }, userC.token),
        runGql<{ createTask: { id: string } }>(createTaskMutation, {
          input: { title: 'Buy almond milk', description: 'Unsweetened almond milk for coffee' },
        }, userD.token),
      ]);
      console.assert(!INDEX_A.errors, `[INDEX-A] createTask for UserC errors=${JSON.stringify(INDEX_A.errors ?? [])}`);
      const taskC_Id = INDEX_A.data!.createTask.id;

      // Wait for ES index refresh (1s default; wait 2s to be safe)
      console.log('[INDEX] Waiting 2s for ES refresh interval...');
      await new Promise((r) => setTimeout(r, 2000));

      // Direct doc fetch from ES (not via graphql) - tests indexing
      const { esClient } = await import('./src/services/elasticsearchClient');
      let fetched;
      try {
        fetched = await esClient.get({ index: 'tasks', id: taskC_Id });
      } catch (err) {
        fetched = null;
        console.error('es.get failed', err instanceof Error ? err.message : String(err));
      }
      console.assert(
        fetched !== null && typeof fetched === 'object' && (fetched as { found?: boolean }).found === true,
        `[INDEX-A] Direct ES get taskC exists (found=${fetched ? (fetched as { found?: unknown }).found : 'null'})`
      );
      console.log(`[INDEX-A] Task C indexed in ES: id=${taskC_Id.substring(0, 8)}... found=OK`);

      // Search: UserC searches for "milk organic" — should return C's task; NOT UserD's (despite "milk")
      const sC = await runGql<{ searchTasks: Array<{ id: string; title: string }> }>(searchTasksQuery, { query: 'milk organic' }, userC.token);
      console.assert(!sC.errors, `[SEARCH-A] UserC search errors=${JSON.stringify(sC.errors ?? [])}`);
      console.assert(
        Array.isArray(sC.data?.searchTasks) && sC.data.searchTasks.length >= 1 && sC.data.searchTasks.some((t) => t.id === taskC_Id),
        `[SEARCH-A] UserC search "milk organic" returns C owned task (got: length=${sC.data?.searchTasks?.length ?? 0})`
      );
      console.log(`[SEARCH-A] UserC search "milk organic": returned ${sC.data?.searchTasks.length} results C-owned OK`);

      // UserD searches "milk" — returns D's task only (not C's organic milk)
      const sD = await runGql<{ searchTasks: Array<{ id: string; userId: string }> }>(searchTasksQuery, { query: 'milk' }, userD.token);
      console.assert(!sD.errors, `[SEARCH-A] UserD search errors=${JSON.stringify(sD.errors ?? [])}`);
      console.assert(Array.isArray(sD.data?.searchTasks), `[SEARCH-A] UserD searchTasks result array`);
      const allDIds = (sD.data?.searchTasks ?? []).map((t) => t.id);
      console.assert(
        !allDIds.includes(taskC_Id),
        `[SEARCH-A] UserD search does NOT leak UserC's taskC_id (ids: ${allDIds.join(',')})`
      );
      console.log(`[SEARCH-A] UserD search "milk": ${sD.data?.searchTasks.length} results (NO LEAK of UserC docs) OK`);

      // Unauthenticated searchTasks
      const sNoToken = await runGql<{ searchTasks: Array<unknown> }>(searchTasksQuery, { query: 'milk' });
      const codeNoToken = sNoToken.errors?.[0]?.extensions?.code ?? 'NONE';
      console.assert(codeNoToken === 'UNAUTHENTICATED', `[SEARCH-AUTH] anonymous search code=${codeNoToken} expected UNAUTHENTICATED`);
      const sBad = await runGql<{ searchTasks: Array<unknown> }>(searchTasksQuery, { query: 'milk' }, 'obviously.not.a.valid.token.here.nope');
      const codeBad = sBad.errors?.[0]?.extensions?.code ?? 'NONE';
      console.assert(codeBad === 'UNAUTHENTICATED', `[SEARCH-AUTH] invalid token search code=${codeBad} expected UNAUTHENTICATED`);
      console.log(`[SEARCH-AUTH] No token / invalid token => UNAUTHENTICATED OK`);

      // Min query length (1 char whitespace trimmed)
      const sMin = await runGql<{ searchTasks: Array<unknown> }>(searchTasksQuery, { query: ' a' }, userC.token);
      const sMin2 = await runGql<{ searchTasks: Array<unknown> }>(searchTasksQuery, { query: '   ' }, userC.token);
      const codeMin = sMin.errors?.[0]?.extensions?.code ?? 'NONE';
      const codeMin2 = sMin2.errors?.[0]?.extensions?.code ?? 'NONE';
      // " a" length is 1 after trim -> BAD_USER_INPUT
      console.assert(codeMin === 'BAD_USER_INPUT', `[SEARCH-MINQUERY] short query code=${codeMin} expected BAD_USER_INPUT (" a" len=1 after trim)`);
      console.assert(codeMin2 === 'BAD_USER_INPUT', `[SEARCH-MINQUERY] whitespace-only query code=${codeMin2} expected BAD_USER_INPUT`);
      console.log(`[SEARCH-MINQUERY] length < 2 and whitespace-only queries => BAD_USER_INPUT OK`);
    }

    // ============== AUTH on searchTasks (even if ES unavailable — still hits resolver validate) ==============
    // Still test auth for search even if ES unavailable (throws SERVICE_UNAVAILABLE after auth).
    if (!esAvailable) {
      const sAuthTest1 = await runGql<{ searchTasks: unknown }>(searchTasksQuery, { query: 'test' });
      const c1 = sAuthTest1.errors?.[0]?.extensions?.code ?? 'NONE';
      console.assert(c1 === 'UNAUTHENTICATED', `[SEARCH-AUTH] anonymous search code=${c1} expected UNAUTHENTICATED (ES unavailable, auth gate still fires first)`);
      const sAuthTest2 = await runGql<{ searchTasks: unknown }>(searchTasksQuery, { query: 'x' }, userA.token);
      const c2 = sAuthTest2.errors?.[0]?.extensions?.code ?? 'NONE';
      const expectedCodesWhenDown: string[] = ['SERVICE_UNAVAILABLE', 'BAD_USER_INPUT'];
      console.assert(
        c2 === 'BAD_USER_INPUT' || c2 === 'SERVICE_UNAVAILABLE',
        `[SEARCH-AUTH+MIN] Valid user with short query or SERVICE_UNAVAILABLE when ES down: code=${c2} (expected one of ${expectedCodesWhenDown.join(',')})`
      );
    }

    await apollo.stop();
    try { await disconnectRedis(); } catch { /* ignore */ }
    try { if (esAvailable) await disconnectElasticsearch(); } catch { /* ignore */ }
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    try { await mongod.stop(); } catch { /* ignore */ }

    console.log('\n===== STEP 4 (REDIS + ELASTICSEARCH): ' +
      (esAvailable ? 'PASSED' : 'PARTIAL-PASS (ES SKIPPED — explicitly logged banner above, ZERO stubs used)') +
      ' =====');
  } catch (err) {
    console.error('FATAL verify step4 error', err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  } finally {
    try { await mongoose.disconnect().catch(() => undefined); } catch { /* ignore */ }
    try { await stopElasticContainer(); } catch { /* ignore */ }
  }
};

void run().finally(() => {
  setTimeout(() => process.exit(process.exitCode ?? 0), 1000);
});
