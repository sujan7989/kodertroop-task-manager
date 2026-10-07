# KoderTroop Step 3 - Task CRUD Vertical Slice

## Overview
- **Summary**: Implement a production-quality, authenticated, ownership-enforced Task domain (MongoDB Mongoose model, dedicated service layer, GraphQL types/resolvers, and verification suite) for the KoderTroop full-stack task management application.
- **Purpose**: Complete Step 3 of the KoderTroop assessment — establish a correct, secure, and tested backend Task CRUD foundation before adding Redis caching (Step 4) and Elasticsearch search (Step 5).
- **Target Users**: Authenticated end-users who need to manage their own private tasks; the assessment grader that verifies CRUD, ownership isolation, auth, validation, and error behavior.

## Goals
- Task CRUD fully functional over GraphQL against a real MongoDB instance.
- Strict per-user ownership enforced server-side at the service layer; user-supplied `userId` inputs are never trusted.
- All task operations require authentication (UNAUTHENTICATED when missing/invalid token).
- Thin GraphQL resolvers that delegate business logic to `taskService.ts`.
- Proper input validation with mapped GraphQL error codes (BAD_USER_INPUT, UNAUTHENTICATED, NOT_FOUND, FORBIDDEN).
- Two-user isolation verification suite (real persistence via MongoDB Memory Server when localhost mongod is unavailable).

## Non-Goals
- Redis task-list caching — deferred to Step 4.
- Elasticsearch full-text search (`searchTasks` query) — deferred to Step 5.
- Premium dashboard UI / frontend visual polish — deferred to dedicated frontend phase after backend stability.
- Pagination, tags, attachments, sharing, comments, admin features.

## Background & Context
- Monorepo layout: `client/` (React/Vite/Tailwind), `server/` (Node/Express 4.19.2 + Apollo Server 3.13.0 + @types/express 4.17.14 pinned, TypeScript strict:true, Mongoose 8.3.2, bcryptjs, jsonwebtoken).
- Step 2 (auth vertical) verified: 13 primary + 4 extra scenarios pass (`npm run verify:auth`).
- Reusable error infrastructure in place: AppError hierarchy with `graphqlErrorCode` discriminator, `formatApolloError` in `server/src/graphql/formatError.ts` (always-on code classification, production message sanitization).
- Auth context from JWT Bearer token via `buildAuthContext()` in `middleware/auth.ts`; `requireAuthenticatedUser()` helper; Context interface carries `user/hadToken/authError`.
- AppError subclasses mapped: `BadRequestError/ValidationError → BAD_USER_INPUT`, `UnauthorizedError → UNAUTHENTICATED`, `ForbiddenError → FORBIDDEN`, `NotFoundError → NOT_FOUND`, `ConflictError → CONFLICT`.
- Environment status on localhost (2026-10-06): external `mongod` on 27017 is **not available** (ECONNREFUSED). DevDependency `mongodb-memory-server@10.4.3` is present and will be used by the verification suite.
- Zero unsafe TS casts in `server/src/` (confirmed by grep for `as any / as never / @ts-ignore / @ts-expect-error` → no matches).

## Functional Requirements
- **FR-1**: Authenticated user can create a task with `title`, `description`, optional `completed` (default false). Server derives `userId` from JWT context.
- **FR-2**: Authenticated user can list their own tasks only (`getTasks` returns array filtered by context userId).
- **FR-3**: Authenticated user can update `title`, `description`, and/or `completed` on an owned task by task ID.
- **FR-4**: Authenticated user can hard-delete an owned task by task ID.
- **FR-5**: All four operations require authentication: missing token → UNAUTHENTICATED; invalid/expired token → UNAUTHENTICATED.
- **FR-6**: Cross-user reads/updates/deletes are strictly forbidden. A request for another user's task ID behaves identically to "not found" for reads; for updates/deletes, if the user doesn't own it → either NOT_FOUND or FORBIDDEN consistently (we choose NOT_FOUND for updates/deletes to avoid enumerating existence of other users' tasks; error code policy explicit in ACs).
- **FR-7**: Input validation rejects bad title/description length, whitespace-only strings, invalid ObjectId, non-boolean completed, missing required fields.
- **FR-8**: Real MongoDB persistence in the verification suite (not stubbed Mongoose model monkey-patches).

## Non-Functional Requirements
- **NFR-1 (Type Safety)**: TypeScript strict:true passes (`tsc --noEmit` exit 0). No `as any`, `as never`, `@ts-ignore`, `@ts-expect-error` anywhere in `server/src/**` or the verification suite (documented extraordinary reason required; none anticipated).
- **NFR-2 (Architecture)**: Modular single-responsibility layout — `models/Task.ts` (schema + Mongoose model), `services/taskService.ts` (all business logic, CRUD + ownership + validation), `graphql/typeDefs.ts` extended with Task types/operations, `resolvers/index.ts` thin wrappers.
- **NFR-3 (Performance)**: Mongoose indexes created for high-cardinality lookups: single-field `userId` for list filtering; compound `(userId, _id)` or `(userId, createdAt desc)` for ownership checks + sort-ordered fetches.
- **NFR-4 (Security)**: No userId from frontend inputs is ever saved or used as a filter; userId for writes/reads always equals `context.user.id`.
- **NFR-5 (Data Integrity)**: `passwordHash` never appears in GraphQL output (existing architecture preserved for User type; Task type has no reference to it — still, no resolver may traverse from Task→User→passwordHash).
- **NFR-6 (Error Quality)**: All operational errors thrown are AppError subclasses with explicit `graphqlErrorCode` discriminator; `formatApolloError` produces classified `extensions.code` in all environments.

## Constraints
- **Technical**: Express@4.19.2, @types/express@4.17.14 pinned. Apollo Server 3.13.0. Mongoose 8.3.2. bcryptjs for auth (task model doesn't need hashing). No Redis/Elasticsearch code or imports added in Step 3.
- **Business**: Project memory hard constraints: no mock/fake Mongo/Redis/Elastic. Use mongodb-memory-server only inside the verification script (not as a runtime infra replacement).
- **Dependencies**: No new npm packages installed for Step 3 (mongodb-memory-server is already present).
- **Stop Condition**: After Step 3 is verified and reviewed, do NOT auto-proceed to Redis/Elasticsearch — stop and present the final report.

## Assumptions
- grader `verify-auth.ts` pattern (separate `verify-tasks.ts` at repo root inside `server/`, `package.json` script `verify:tasks` executing it via `ts-node --transpile-only`) is acceptable.
- For Step 3, `getTasks` returns an un-paginated array of all tasks for the authenticated user; pagination stubs (PaginationArgs, PaginatedResult) already exist in types and will be wired up if useful, but the requirement only mandates read — a bare array is acceptable as long as the schema explicitly matches.
- Task ID validation for `getTasks` (no id; list) vs `updateTask`/`deleteTask` (id required): invalid ObjectId string → BAD_USER_INPUT before DB query.
- Error policy for cross-user update/delete: return `NOT_FOUND` (not `FORBIDDEN`) so we don't leak existence of other users' tasks. Assumption will be made explicit in acceptance criteria and test cases.

## Acceptance Criteria

### AC-1: Task Mongoose model and persistence
- **Type**: `rule`
- **Given**: A MongoDB server is reachable (via mongodb-memory-server or real mongod)
- **When**: A task is created through the service layer
- **Then**: The Task document is stored in MongoDB with exactly: required title, required description, completed (bool default false), userId (ObjectId ref), createdAt, updatedAt (timestamps), title/description trimmed, valid lengths enforced, ObjectId validity enforced, indexes on userId/compound present
- **Pass Condition**: `verify-tasks.ts` CRUD scenarios (10/11/12/13/14) round-trip data correctly from real MongoDB (no stubbed model methods)
- **Evidence**: `npm run verify:tasks` output showing stored/fetched/updated/deleted document matches

### AC-2: Task service layer owns business logic; resolvers stay thin
- **Type**: `rule`
- **Given**: Codebase post implementation
- **When**: Reviewing imports in `resolvers/index.ts` and call-site topology
- **Then**: Every task operation (create/get/update/delete) is implemented in `taskService.ts`; resolvers call at most `requireAuthenticatedUser(context.user)` + one `taskService.<op>` and return the result (no inline `TaskModel.find/update` in resolvers)
- **Pass Condition**: `resolvers/index.ts` contains zero direct `TaskModel` references; all CRUD operations in `taskService.ts`
- **Evidence**: Static code inspection (grep `TaskModel` in resolvers/ → no matches; grep in services/taskService.ts → matches)

### AC-3: GraphQL schema exposes required Task types and operations without client-controlled userId
- **Type**: `rule`
- **Given**: Running ApolloServer introspection enabled (default for dev/test)
- **When**: Introspection query for `Query.getTasks`, `Mutation.createTask/updateTask/deleteTask`, `Task` object fields, inputs
- **Then**: `Task.id`, `Task.title`, `Task.description`, `Task.completed`, `Task.userId`, `Task.createdAt`, `Task.updatedAt` all non-null as appropriate; `CreateTaskInput` has NO `userId` field; `UpdateTaskInput` has NO `userId` field; `getTasks` takes optional filter but NO userId filter parameter accepted from client that would override server userId
- **Pass Condition**: introspection confirms schema fields/matches; input types have no userId property
- **Evidence**: `verify-tasks.ts` pre-check that prints schema introspection summary and asserts no userId in inputs

### AC-4: User ownership isolation (security-critical)
- **Type**: `rule`
- **Given**: Two registered users UserA and UserB, each owns one task
- **When**: UserA queries `getTasks`; UserB queries `getTasks`; UserA attempts updateTask/deleteTask on UserB's task ID; UserB attempts updateTask/deleteTask on UserA's task ID
- **Then**: UserA's getTasks contains exactly UserA's task; UserB's getTasks contains exactly UserB's task; cross-user update returns error code NOT_FOUND (task not found or not owned) with no data change; cross-user delete returns NOT_FOUND with no data change; neither side can enumerate existence of the other's tasks via distinct error codes
- **Pass Condition**: 8 ownership scenarios all pass assertions in verify-tasks.ts (UserA-only A, UserB-only B, A→B update fail, A→B delete fail, B→A update fail, B→A delete fail, reverse getTasks empty)
- **Evidence**: `npm run verify:tasks` ownership section output and zero Assertion failed lines

### AC-5: Authentication enforced for all four task operations
- **Type**: `rule`
- **Given**: Anonymous requests (no Authorization header) and requests with an invalid JWT
- **When**: `createTask`, `getTasks`, `updateTask`, `deleteTask` are invoked
- **Then**: Every invocation returns an error with `extensions.code === 'UNAUTHENTICATED'`; no data is mutated or returned
- **Pass Condition**: 8× (4 ops × 2 token states) assertion passes in verify-tasks.ts error cases section
- **Evidence**: scenario lines 1/4 + invalid-token variants all have code=UNAUTHENTICATED

### AC-6: Validation and error handling correctness
- **Type**: `rule`
- **Given**: Operations with invalid inputs (cases list from Step 3 G items 1–9)
- **When**: Create with empty/whitespace-only title → BAD_USER_INPUT; create with title too long/short → BAD_USER_INPUT; create with invalid description → BAD_USER_INPUT; update/delete invalid ObjectId string → BAD_USER_INPUT; update/delete well-formed ObjectId but task doesn't exist → NOT_FOUND; cross-user update/delete → NOT_FOUND (per AC-4 policy)
- **Then**: Each scenario returns the correct classified error code; no raw MongoError or Mongoose ValidationError leaks to client (messages are user-safe via AppError)
- **Pass Condition**: 9+ distinct error scenario assertions in verify-tasks.ts all pass
- **Evidence**: numbered error cases [1]…[9] each with code-assertion passed printed in verify:tasks output

### AC-7: Successful CRUD happy paths
- **Type**: `rule`
- **Given**: Authenticated single user
- **When**: createTask → returns id/title/description/completed=false/userId/createdAt/updatedAt; getTasks → single-item array with same data; updateTask (new title, new description, completed=true) → reflected in subsequent getTasks; separate completion-only toggle (completed=false) → reflected; deleteTask → subsequent getTasks empty and update returns NOT_FOUND
- **Then**: All 5 happy-path operations (cases 10–14) round-trip correctly with expected field values
- **Pass Condition**: scenario lines [10]…[14] each print OK and no assertion fails
- **Evidence**: verify-tasks happy-path section

### AC-8: Typecheck, build, and TS safety zero-unsafe-casts
- **Type**: `rule`
- **Given**: Fresh implementation
- **When**: `npm run typecheck && npm run build` runs
- **Then**: Both exit 0; `grep -E "as any|as never|@ts-ignore|@ts-expect-error" server/src server/verify-tasks.ts` yields zero lines
- **Pass Condition**: both compile cleanly and grep no matches
- **Evidence**: command output captured in implementation completion evidence + IDE diagnostics

### AC-9: Architecture quality (rubric)
- **Type**: `rubric`
- **Dimension**: Step 3 Task vertical module architecture fidelity with project conventions
- **Scale**: 1-5
- **Anchors**: 1 = Task logic smeared in resolvers, no service layer, no validation, inconsistent naming. 3 = Basic model/service/resolver split but some leaks, duplicate ownership checks, missing indexes. 5 = Clean single-responsibility layout matching existing auth vertical conventions (toPublicTask mapper, dedicated validators, single ownership check, no duplication), consistent naming with User/Auth patterns, thin resolvers, proper index design.
- **Pass Threshold**: >= 4
- **Evidence**: Reviewer code inspection against rubric anchors

### AC-10: Test matrix comprehensiveness and isolation (rubric)
- **Type**: `rubric`
- **Dimension**: Coverage + independence of verification suite
- **Scale**: 1-5
- **Anchors**: 1 = Only happy path create+list, no multi-user isolation, no error-code assertions. 3 = Full CRUD happy path + 2-user getTasks isolation, but missing some cross-user update/delete or edge validations. 5 = Full G error cases 1-9 all independently exercised with code assertions, full happy paths 10-14, explicit 2-user 8-way ownership matrix, real MongoDB via mongodb-memory-server (no model stubs)
- **Pass Threshold**: >= 4
- **Evidence**: Reviewer scan of verify-tasks.ts structure + run output

## Open Questions
- None. All policy decisions (cross-user error code = NOT_FOUND; no pagination required in step 3; mongodb-memory-server as verification-only persistence) are documented in assumptions and will be implemented accordingly.
