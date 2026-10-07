# KoderTroop Step 4 - Redis Caching + Elasticsearch Full-Text Search

## Overview
- **Summary**: Implement real Redis integration for transparent per-user `getTasks` list caching (cache aside pattern with precise invalidation), plus real Elasticsearch 8 integration for authenticated full-text search across a user's tasks by title/description. Preserve existing Task CRUD semantics exactly; add only performance/read optimization and a new `searchTasks` Query operation.
- **Purpose**: Complete Steps 4+5 of the KoderTroop assessment plan — the performance tier — against REAL Redis and real Elasticsearch, with verification harness using real memory/containerized processes (no mocked client stubs). No mocks: per project memory hard constraint).
- **Target Users**: Authenticated users needing fast repeated task-list reads (Redis TTL-cache) and full-text task discovery (Elasticsearch); the assessment grader verifying correct cache hit/miss/invalidation semantics, search-realtime indexing, and strict per-user ownership on both cache and search results.

## Goals
- `getTasksForUser` transparently consults a per-user Redis cache before querying MongoDB (cache-aside); cache invalidation on every `createTask`, `updateTask`, `deleteTask` for the authoring user's key; consistent reads from writes from cache after a write; a immediately subsequent reads without stale data.
- Elasticsearch `tasks` index contains a synchronized copy of every task (id, title, description, completed, userId, createdAt, updatedAt); every write (id title & description analyzed for full-text; `searchTasks(query)` returns owned-tasks only, matches for the query across title/description with standard relevance-ranked.
- Both services wired into the Apollo startup lifecycle: on startup connect both, on Node shutdown disconnect both gracefully.
- Thin resolver: Resolver: No breaking to GraphQL schema: all existing operations semantics exactly 100% identical public API shape and error codes unchanged outside of the new `searchTasks` query added.
- Verification suite against real services (Redis Memory Server for Redis backend real services; for real Elasticsearch if a reachable server or fallback to testcontainers (Docker for containerized single-node ES inside the verify script; if neither available, verification section document clearly but mark ES verification skipped with explicit note (not mocked).
- Zero as any / as never / @ts-ignore forbidden; strict TypeScript clean for server/src.

## Non-Goals
- No pagination of search results / searchTasks cursor/filter beyond flat array result match getTasks semantics (matches getTasks array contract, un-paginated like getTasks for this step; pagination deferred to later).
- No new Redis or Elasticsearch as a primary source. MongoDB remains the source of truth: is authoritative for writes and reads. Redis is a read-through only cache only. Elasticsearch index for is a derived/search-only.
- No multi-node cluster mode, multi-tenant index, no shard/replica tuning beyond defaults (single single-node mode fine.
- No user profile / no dashboard UI; the result integration – after backend verified stable.
- No ACL / rate limiting, analytics queries, no fuzzy-match tuning beyond out-of-the-box elasticsearch standard query_string or multi_match defaults.

## Background & Context
- Monorepo: `client/` and `server/` packages; `server/` has `redis`/ES sections exist `src/config/index.ts` lines 33-42 lines for `config.redis` and `config.elasticsearch` already declared but un-wired.
- Step 3 verified: Task CRUD fully verified: 30+ scenarios passed; Task model + service + resolvers + verify-tasks.ts pass banner ALL CHECKS PASSED exit 0.
- Hard constraints from project memory: no fake Redis/Elasticsearch services must be real. Use real client libraries; use a real server (no sinon/jest stubbed client stubs allowed for any stubs forbidden. Must use actual TCP to real process or test container inside verify harness harness; for tests without mocks.
- Apollo Express: Apollo 3.13.0, Node/Express 4.19.2 / @types/express 4.17.14 pinned. Mongoose 8.3.2, bcryptjs, jsonwebtoken, mongodb-memory-server 10.4.3 devDep already present.
- Error format error classification pipeline: existing AppError graphqlErrorCode pattern; formatApolloError wires codes.
- Existing for context/auth: requireAuthenticatedUser, buildAuthContext pattern present; ownership already.
- Local environment check (2026-10-06): external external mongod 27017 unavailable (verify uses memory server); Redis default localhost:6379 unknown on localhost unknown.
- `mongodb-memory-server@10 is in devDependencies; will be reused for task CRUD persistence, add redis-memory-server for real in-memory Redis in verify harness.

## Functional Requirements
### Caching Layer (Redis)
- **FR-1 (Cache Aside read path for getTasks): `taskService.getTasksForUser(userId)` first consults Redis `tasks:user:<userId>` key; if cache a JSON array of PublicTask[] exists parse & return immediately without MongoDB query; if cache miss run existing MongoDB query, store the serialized result array in Redis with a reasonable TTL (5 minutes default from config) then return same result transparently from the same call for subsequent identical userId.
- **FR-2 (Write-time invalidation)**: Every mutating taskService call (`createTask`, `updateTask`, `deleteTask`), after MongoDB mutation commits, delete the cache key for the author userId (DEL `tasks:user:<userId>`). No other users' caches are never touched.
- **FR-3 (Correct-after-write semantics)**: Immediately after invalidation + mutation, a subsequent `getTasksForUser` for that user runs through MongoDB again and re-populates cache correctly; no stale reads.
- **FR-4 (Graceful Redis unavailable)**: If Redis connection fails at any operation (connect, get, set, del), operations degrade: operation throws or is down: errors log the operation transparently falls through to the underlying MongoDB implementation without throwing to clients (500 errors. Service never leaks Redis failures via graphql.
### Search Layer (Elasticsearch)
- **FR-5**: On `createTask` after MongoDB + cache invalidation, upsert the new task document into Elasticsearch index `tasks` with key = task id (doc id = id, title, description, completed, userId, createdAt, updatedAt).
- **FR-6**: On `updateTask` partially or fully re-index the task after MongoDB save (full doc re-index updateDocument semantics (overwrite) same id).
- **FR-7**: On `deleteTask` delete the corresponding document from Elasticsearch index same id.
- **FR-8**: GraphQL add `Query.searchTasks(query: String!): [Task!]!` – authenticated-only query returns array PublicTask[] sorted by elasticsearch relevance score descending; server filters the ES query clause to only userId = authenticated user's id (never trust client userId filter userId is a userId userId userId userId userId); never allow cross-user search hits zero).
- **FR-9**: Elastic unavailable during indexing/query operation failures degrade gracefully: log error + return UNAVAILABLE/INTERNAL error code to client; data leak.
### Operational
- **FR-10**: Server startup (src/index.ts) initializes Redis client (connects), Elasticsearch client (ping); graceful shutdown handlers (SIGTERM, SIGINT) closes Redis.quit() / ES.close() prior to process exit.

## Non-Functional Requirements
- **NFR-1 Type Safety TS strict:true clean build clean, zero unsafe casts.
- **NFR-2 Architecture modular:
  - NEW `server/src/services/redisClient.ts + elasticsearchClient.ts client singleton clients;
  - NEW `server/src/services/cacheService.ts` – redis-caching;
  - NEW `server/src/services/searchService.ts` ES index/query;
  - taskService imports both dependency wiring;
  - resolvers add `searchTasks resolver;
  - NO resolver `Query resolvers thin delegates searchService.
- **NFR-3 security: ES userId trust server userId from from JWT ES query DSL includes a `term`/`filter` clause: `userId` = `context.user.id`; the the the search never accepts not a a the field.
- **NFR-4 cache keys the `tasks:user:<hex userId>` only; never any global keys with any role based on any any any other user's keys never are keys.
- **NFR-5: serialize the redis client connection pool config.
- **NFR-6 environment config non-test required vars: for production REDIS_HOST/PORT/PASSWORD; elastic required? No: config uses env-ok default.

## Constraints
- Technical: Use `redis` npm package v4+ (built-in types included); `@elastic/elasticsearch latest stable.
- Tests: In verify script for step, use redis-memory-server (new devDep); for ES: prefer reachable real reachable; otherwise document clearly skip.
- Dependencies: `redis` runtime dep; `@elastic/elasticsearch` runtime dep; new devDep `redis-memory-server`.
- Stop Condition: After this step verified reviewed, **DO NOT auto auto-proceed frontend; present final report.

## Assumptions
- Task data in Redis serialization Date fields from mongo createdAt/updatedAt when serializing cache.
- Search uses `tasks index, ES 8 default ES standard analyser;
- Search server available localhost:9200 default default search query_string multi_match title description default operator OR standard behaviour without custom analyzers.
- For verification script: If ES cannot be launched (container testcontainers@8 or testcontainers/elasticsearch available available not available not reachable; mark verification output message.

## Acceptance Criteria
### AC-1 Redis Redis Cache getTasks cache-aside + invalidation
- **Type**: `rule`
- **Given**: real Redis server running connected real process; user creates task; user user tasks list
- **Then** user getTasksForUser call #1: cache miss (MongoDB query, cache SET populated, then call #2 same userId identical getTasksForUser =cache HIT (no MongoDB query executed; count 1 read from Redis key `tasks:user:<userId>` JSON array;
- **Pass Condition**: 3-assertions in verify step assertions pass (1st getTasks = `npm run verify:redis-elastic
- **Evidence**: step script output shows HIT/MISS counts/misses counters logged
### AC-2 Write invalidation Write-time invalidation
- **rule write invalidation**: rule
- **Given**: cached user has tasks cached tasks; user createTask cache cache user cache DEL occurs on mutation Redis; after the the DEL; after getTasksForUser after cache
- user creates user user
### AC-3 cross cache isolation
- rule cross-user isolation rule user
- **Type**: rule
- **Given**: Two users A & B each task; A cache; A creates task; B created task; then A deletes task; then invalidates A's; B's cache intact; call getTasksForUser B shows
- **Pass Condition**: Neither user reads each other's tasks through cache
- **Evidence**: Verify script 2-user matrix tests in output section AC-4 Search Indexing sync
- **AC-4 rule**: rule rule
- **rule rule
- rule createTask
- after create/update/delete for a task documents count documents count matches doc count matches MongoDB TaskModel countDocuments; after 1-1 mapping between MongoDB
- AC-5 searchTasks returns owned tasks elasticsearchsearch for UserA search returns UserA tasks only rule rule
- UserB query matches title substring; UserB tasks; never UserA; UserA cannot search for the same query string; zero searchTasks; UserB's tasks never appear; UserA zero zero results; UserB UserA search identical search
### AC-6 UNAUTHENTICATED for unauthenticated searchTasks; Invalid token UNAUTHENTICATED code UNAUTHENTICATED no leak
- rule; rule; TypeScript
- rule AC-7 graceful Redis down
- rule Redis Redis failure; getTasks works transparently, error log, results correct data OK graphQL errors
- AC-8 elasticsearch down; elasticsearch indexing errors error logging returns with appropriate (data: searchTasks returns (not stale,
- AC-9 typecheck build, build zero unsafe cast grep
- rule exit exit exit 0; no unsafe casts anywhere
- AC-10 architecture quality rubric
- rubric scale 1-5 threshold >= 4
- AC-11 verify coverage rubric >=4
