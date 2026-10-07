# KoderTroop Step 4 - Redis Caching + Elasticsearch Implementation Plan

## Task 1: Install runtime + verification dependencies (server/package.json)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Runtime deps: `redis` ^4.x (includes built-in TS types), `@elastic/elasticsearch` latest stable 8.x.
  - DevDep: `redis-memory-server` (latest stable, for verify harness real in-memory Redis like MongoMemoryServer).
  - Edit server/package.json: add to dependencies and devDependencies.
  - Run `npm install` inside `server/` to lock package-lock.
  - Preserve all existing versions (express, mongoose etc untouched).
- **Acceptance Criteria Addressed**: Pre-requisite for all ACs (AC-1..AC-11)
- **Test Requirements**:
  - `rule` TR-1.1: After install, `node -e "require('redis'); require('@elastic/elasticsearch');"` from cwd server exits 0.
  - `rule` TR-1.2: `npm run typecheck` still exits 0 after package.json + install (no package-level breakage).
  - `rule` TR-1.3: `node -e "console.log(require.resolve('redis-memory-server'))"` exits 0 (devDep available for verify).
- **Notes**: Install order matters: deps before compile.
- **Completion Evidence**:
  - `server/package.json:dependencies` — redis@^4.7.1, @elastic/elasticsearch@^8.19.2 present.
  - `server/package.json:devDependencies` — redis-memory-server@^0.17.1 present.
  - `npm run typecheck` exit 0 (TR-1.2) after install.

## Task 2: Redis client singleton (server/src/services/redisClient.ts)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - Create new module `server/src/services/redisClient.ts`.
  - Import `config` from `../config`.
  - Export `redisClient: ReturnType<typeof redis.createClient>` singleton.
  - Export `async connectRedis(): Promise<void>` — calls `redisClient.connect()` with try/catch, graceful unavailable OK.
  - Export `async disconnectRedis(): Promise<void>` — `redisClient.quit()` wrapped.
  - Export helper `isRedisReady(): boolean`.
- **Acceptance Criteria Addressed**: AC-1, AC-7, AC-9
- **Test Requirements**:
  - `rule` TR-2.1: `npm run typecheck` exit 0; no unsafe casts in new file (static grep empty).
  - `rule` TR-2.2: Static code review: no `throw` in connectRedis path; only `logger.error` inside catch.
  - `rubric` TR-2.3: Client singleton pattern mirrors ES client (Task 3) for symmetry.
- **Completion Evidence**:
  - `src/services/redisClient.ts` created: singleton createClient socket host/port/password; error/ready/end listeners no-throw; connect/disconnect/isRedisReady exports.
  - GetDiagnostics: 0 diagnostics (file redisClient.ts).
  - Grep safety: 0 matches `as any|as never|@ts-ignore|@ts-expect-error`.

## Task 3: Elasticsearch client singleton (server/src/services/elasticsearchClient.ts)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - New module elasticsearchClient.ts: `Client` singleton, connectElasticsearch (ping bool), disconnectElasticsearch, isElasticReady flag.
- **Acceptance Criteria Addressed**: AC-4, AC-8, AC-9
- **Test Requirements**:
  - `rule` TR-3.1: typecheck passes; no unsafe casts.
  - `rule` TR-3.2: No `throw`; ping failure `→ logger.error + return false`.
- **Completion Evidence**:
  - `src/services/elasticsearchClient.ts` created: buildClientOptions elastic auth if username/password; esClient singleton with fallback constructor catch; connectElasticsearch() ping→bool; disconnect close; isElasticReady boolean.
  - `npm run typecheck` exit 0; GetDiagnostics elasticsearchClient.ts 0 diagnostics.

## Task 4: Cache service for getTasks lists (server/src/services/cacheService.ts)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - New module cacheService.ts: TTL 300s TASK_CACHE_TTL_SECONDS; taskCacheKey(userId)=>`tasks:user:${userId}`; getCachedTasks, setCachedTasks, invalidateTasksCache.
  - Strict JSON deserialize with runtime narrowing Date from ISO strings; Redis not-ready → null degrade, catch+log.
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-7
- **Test Requirements**:
  - `rule` TR-4.1: typecheck exit 0; no unsafe casts.
  - `rule` TR-4.2: `getCachedTasks` returns strict `null` on Redis-not-ready.
  - `rule` TR-4.3: Date deserialization produces real `Date` objects.
- **Completion Evidence**:
  - `src/services/cacheService.ts` created: TASK_CACHE_TTL_SECONDS=300; getCachedTasks null when !isRedisReady; JSON.parse→runtime narrowing Date for createdAt/updatedAt; setCachedTasks setEx; invalidateTasksCache del; all internal catch+log.
  - Verify harness CACHE-A hit/miss/populate OK; CACHE-B DEL invalidate OK; CACHE-C cross-user isolation OK.
  - GetDiagnostics cacheService.ts 0 diagnostics.

## Task 5: Search service — indexing + query (server/src/services/searchService.ts)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - New module searchService.ts: TASKS_INDEX='tasks'; ensureTasksIndex (ignore 400 already_exists); indexTask/updateTaskIndex/removeTaskFromIndex degrade !isElasticReady; searchTasks userId filter+multi_match on title/description; UnavailableError subclass with graphqlErrorCode SERVICE_UNAVAILABLE added to AppError.ts + formatApolloError mapping.
- **Acceptance Criteria Addressed**: AC-4, AC-5, AC-6, AC-8
- **Test Requirements**:
  - `rule` TR-5.1: typecheck passes; no unsafe casts.
  - `rule` TR-5.2: searchTasks query DSL userId filter clause exact `{ term: { userId } }`; query server-only no client userId.
  - `rule` TR-5.3: ensureTasksIndex catches 400 already_exists and does not throw.
- **Completion Evidence**:
  - `src/services/searchService.ts` created: ensureTasksIndex ignore400; index/update/remove degrade notReady; searchTasks throws UnavailableError when !isElasticReady else query bool filter userId term + must multi_match title description sort _score desc return ids only map.
  - `src/errors/AppError.ts:55-59` added `UnavailableError extends AppError` graphqlErrorCode=SERVICE_UNAVAILABLE httpStatus=503.
  - `src/graphql/formatError.ts:10,46,60,67,78` updated: import UnavailableError; classifyErrorCode via instanceof + cn string; safeSet adds SERVICE_UNAVAILABLE.
  - GetDiagnostics searchService.ts 0 diagnostics.

## Task 6: Wire taskService with cache + search index triggers
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 4, Task 5
- **Description**:
  - Modify taskService.ts: import cacheService + searchService; toPublicTask exported; getTasksForUser rewritten cache-aside; create/update/delete invalidateCache + index after writes.
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4
- **Test Requirements**:
  - `rule` TR-6.1: typecheck passes; no `try/catch` required in taskService.
  - `rule` TR-6.2: grep order: invalidate/index AFTER MongoDB write.
  - `rule` TR-6.3: getTasksForUser returns identical array shape with/without cache.
- **Completion Evidence**:
  - `src/services/taskService.ts:1-13 imports + exports toPublicTask; 37-45 getTasksForUser rewrite cache-aside; 124-160 createTask invalidates+index; 180-214 update/delete invalidate+index`.
  - Verify CACHE-B create DEL on write invalidates correctly; CACHE-C delete invalidates only A cache.

## Task 7: Extend GraphQL typeDefs with searchTasks query
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 5
- **Description**:
  - In Query typeDefs append `searchTasks(query: String!): [Task!]!`.
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `rule` TR-7.1: schema returns [Task!]! for searchTasks.
  - `rule` TR-7.2: typecheck passes.
- **Completion Evidence**:
  - `src/graphql/typeDefs.ts:5 Query.searchTasks` appended.
  - Verify harness Apollo server starts with schema.

## Task 8: Add searchTasks thin resolver
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 6
- **Description**:
  - Resolver searchTasks: requireAuth first; min length 2 BAD_USER_INPUT; searchService userId filter then Mongo re-fetch $in+userId defense-in-depth score-order toPublicTask returned.
- **Acceptance Criteria Addressed**: AC-5, AC-6
- **Test Requirements**:
  - `rule` TR-8.1: All paths requireAuthenticatedUser.
  - `rule` TR-8.2: Resolver uses MongoDB find re-filter ownership not ES docs.
  - `rule` TR-8.3: typecheck 0.
- **Completion Evidence**:
  - `src/resolvers/index.ts:106-142 searchTasksResolver` thin with auth+minlength+defense $in+userId re-filter score order.
  - Verify searchTasks anonymous→UNAUTHENTICATED; short query→BAD_USER_INPUT.

## Task 9: Wire startup + shutdown lifecycle (server/src/index.ts)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Tasks 2, 3, 5
- **Description**:
  - src/index.ts bootstrap: after connectDatabase → connectRedis → connectElasticsearch → ensureTasksIndex; /health endpoint returns redis/elastic status strings; gracefulShutdown SIGINT/SIGTERM calls HTTP close, apollo.stop, disconnectRedis disconnectElasticsearch, mongoose.disconnect wrapped try catch.
- **Acceptance Criteria Addressed**: FR-10 Operational
- **Test Requirements**:
  - `rule` TR-9.1: typecheck passes; disconnect try/catch.
- **Completion Evidence**:
  - `src/index.ts:1-24+28-133` full rewrite lifecycle connect, shutdown handlers SIGINT SIGTERM wrapped try catch.
  - GetDiagnostics src/index.ts 0 diagnostics.

## Task 10: Add package.json verify:redis-elastic entry
- **Status**: `completed`
- **Priority**: medium
- **Depends On**: Task 1
- **Description**:
  - scripts entry `"verify:redis-elastic": "ts-node --transpile-only verify-redis-elastic.ts"` in server/package.json.
- **Completion Evidence**:
  - `server/package.json:13` script verify:redis-elastic present.
  - `npm run verify:redis-elastic` resolves; exit code 0 on final run (ES SKIPPED acknowledged PARTIAL-PASS).

## Task 11: Write verify-redis-elastic.ts verification harness
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Tasks 1-10
- **Description**:
  - New file verify-redis-elastic.ts: NODE_ENV=test; MongoMemoryServer+mongoose connect; RedisMemoryServer create host/port env override BEFORE services import; Elasticsearch probe localhost:9200 then Docker child_process spawn fallback elasticsearch 8.14.3; Apollo+runGql+registerAndLogin helpers; CACHE-A/B/C sections (5 assertions), CACHE-GRACEFUL (Redis quit fallback), INDEX/SEARCH (ES available), SEARCH-AUTH/min query, finally cleanup; banner PASSED/PARTIAL-PASS (ES SKIPPED) with explicit notice when skip.
- **Completion Evidence**:
  - `verify-redis-elastic.ts` created: 465 lines with all sections; explicit SKIP banner for ES (Reason: No reachable Elasticsearch and Docker unavailable for launch); CACHE A/B/C/GRACEFUL sections OK; AUTH/min sections UNAUTHENTICATED/BAD_USER_INPUT; finally cleanup + setTimeout process.exit for lingering handles.
  - Final run exit 0 PARTIAL-PASS banner printed.
  - GetDiagnostics verify-redis-elastic.ts 0 diagnostics.

## Task 12: Final typecheck, build, diagnostics, safety audit
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Tasks 1-11
- **Description**:
  - Run `npm run typecheck && npm run build && npm run verify:redis-elastic`.
  - Grep unsafe cast patterns across server/src/** + verify-redis-elastic.ts → 0 matches.
  - GetDiagnostics all new/modified TS files → 0 each.
- **Completion Evidence**:
  - `npm run typecheck` exit 0.
  - `npm run build` exit 0.
  - `npm run verify:redis-elastic` exit 0 with STEP4 PARTIAL-PASS banner (ES SKIPPED explicitly logged, CACHE sections OK, AUTH/min OK).
  - Unsafe cast grep server/src/** + verify-redis-elastic.ts → 0 matches.
  - GetDiagnostics 11 files (cacheService, searchService, redisClient, elasticsearchClient, resolvers, taskService, index.ts, typeDefs, formatError, AppError, verify-redis-elastic) — ALL 0 diagnostics each.
