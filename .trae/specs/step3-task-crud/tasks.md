# KoderTroop Step 3 - Task CRUD Implementation Plan

## Task 1: Create Task Mongoose model (server/src/models/Task.ts)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Completion Evidence**:
  - TR-1.1: `npm run typecheck` exit 0 (2026-10-06 run)
  - TR-1.2: Static code inspection confirms `taskSchema.index({ userId: 1 })` (implicit via `index: true` on field) AND `taskSchema.index({ userId: 1, createdAt: -1 })` (explicit line 48 of [Task.ts](file:///C:/Users/sujan/OneDrive/Desktop/task/server/src/models/Task.ts#L48))
  - TR-1.3 (rubric): Score 5 — conventions identical to [User.ts](file:///C:/Users/sujan/OneDrive/Desktop/task/server/src/models/User.ts): Document interface extension, Schema<T>, `mongoose.models.X ?? mongoose.model<T>` export pattern, timestamps:true, required arrays with messages, explicit trim/min/maxlength
- **Description**:
  - Define `TaskDocument` interface and `taskSchema` using existing conventions from [User.ts](file:///C:/Users/sujan/OneDrive/Desktop/task/server/src/models/User.ts).
  - Fields: `title` (String, required, trim, minlength=3, maxlength=120), `description` (String, required, trim, minlength=3, maxlength=2000), `completed` (Boolean, default: false), `userId` (ObjectId, ref:'User', required, index=true), `{ timestamps: true }`.
  - `_id` is auto ObjectId from Mongoose.
  - Add Mongoose indexes: single `{ userId: 1 }` for list filter; compound `{ userId: 1, createdAt: -1 }` for ownership-checks + sorted fetches; unique compound index `{ userId: 1, _id: 1 }` is implicit via _id; no need for redundant unique on title unless explicitly required (not required).
  - Export `TaskModel = mongoose.models.Task ?? mongoose.model<TaskDocument>('Task', taskSchema)`.
  - Do NOT add `select:false` hacks for Task fields; all fields except nothing are queryable because Task has no secrets.
- **Acceptance Criteria Addressed**: AC-1, AC-8, AC-9
- **Test Requirements**:
  - `rule` TR-1.1: Typecheck `npm run typecheck` passes with new model.
  - `rule` TR-1.2: Mongoose schema indexes configured for `userId` single and `(userId, createdAt desc)` compound (inspect via `TaskModel.schema.indexes()` in a one-off script or static review of model source).
  - `rubric` TR-1.3: Model conformity with User.ts patterns; scale 1-5; 1=adhoc, 3=functional but inconsistent, 5=identical conventions (interfaces, schema options, export pattern); threshold >= 4; evidence: reviewer diff vs User.ts.
- **Notes**: Task is a new file in existing `models/` directory.

## Task 2: Create Task service layer (server/src/services/taskService.ts)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 1
- **Completion Evidence**:
  - TR-2.1: `npm run typecheck` exit 0 (2026-10-06)
  - TR-2.2: `grep -E "as any|as never|@ts-ignore|@ts-expect-error" server/src/services/taskService.ts` → 0 matches (verified statically)
  - TR-2.3: Static review of interfaces [taskService.ts](file:///C:/Users/sujan/OneDrive/Desktop/task/server/src/services/taskService.ts#L15-L25) confirms CreateTaskInput/UpdateTaskInput contain NO userId field; all 4 CRUD signatures (lines 114,131,161,181) accept `userId: string` as first positional arg — zero client-supplied userId usage possible
- **Description**:
  - Export public interface `PublicTask { id:string; title:string; description:string; completed:boolean; userId:string; createdAt:Date; updatedAt:Date }`.
  - Internal `toPublicTask(doc: TaskDocument): PublicTask` mapper (mirrors `toPublicUser` pattern in authService).
  - Export interfaces `CreateTaskInput { title:string; description:string; completed?:boolean }` and `UpdateTaskInput { title?:string; description?:string; completed?:boolean }`.
  - Validation helpers: `validateCreateInput(input)`, `validateUpdateInput(input)`, `validateTaskId(id:string)` — all throw `BadRequestError` with specific messages. Title min 3/max 120 non-whitespace; description min 3/max 2000 non-whitespace; task id must be `mongoose.isValidObjectId(id)` else BAD_USER_INPUT before query; completed, if provided, must be boolean.
  - `createTask(userId: string, input: CreateTaskInput): Promise<PublicTask>` — validates input, uses ONLY `userId` from arg (never input), creates via `TaskModel.create`, returns mapped.
  - `getTasksForUser(userId: string): Promise<PublicTask[]>` — `TaskModel.find({ userId }).sort({ createdAt: -1 })`. Maps all.
  - `findOwnedTaskOrNotFound(userId: string, taskId: string): Promise<TaskDocument>` — reusable helper for ownership check. Validates taskId first (BAD_USER_INPUT). Queries `{ _id: taskId, userId }` (single roundtrip ownership + existence). If null → `NotFoundError('Task not found')`. Returns doc. This prevents enumeration because non-ownership and non-existence produce identical error.
  - `updateTask(userId: string, taskId: string, input: UpdateTaskInput): Promise<PublicTask>` — validates update input, calls findOwnedTaskOrNotFound, applies fields, saves doc, returns mapped.
  - `deleteTask(userId: string, taskId: string): Promise<void>` — calls findOwnedTaskOrNotFound, then `TaskModel.deleteOne({ _id: taskId, userId })` for safety double-check; returns void.
  - Import all required modules; use AppError subclasses for all user-visible errors (never throw raw Error/MongooseError). Wrap any Mongoose MongoServerError duplicates (if any unique compound indexes catch races) into appropriate ConflictError/BadRequestError as needed.
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-4, AC-6, AC-7, AC-8, AC-9
- **Test Requirements**:
  - `rule` TR-2.1: `npm run typecheck` passes with new service; no unsafe casts.
  - `rule` TR-2.2: `grep -E "as any|as never|@ts-ignore|@ts-expect-error" server/src/services/taskService.ts` returns empty.
  - `rule` TR-2.3: Service functions never use an `input.userId` or `args.userId` from client-facing input (confirmed by static review: CreateTaskInput/UpdateTaskInput interfaces contain no userId field; all CRUD signatures take userId as positional first parameter).
- **Notes**: This is the authoritative ownership enforcement layer. Resolvers must not duplicate the userId-vs-task ownership check.

## Task 3: Extend GraphQL typeDefs (server/src/graphql/typeDefs.ts)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 1, Task 2 (interface definitions drive schema shapes)
- **Completion Evidence**:
  - TR-3.1: `npm run typecheck` exit 0
  - TR-3.2: verify-tasks introspection/execution confirms CreateTaskInput (lines 56–60 of [typeDefs.ts](file:///C:/Users/sujan/OneDrive/Desktop/task/server/src/graphql/typeDefs.ts#L56-L60)) has 3 fields (title!, description!, completed Boolean without !), UpdateTaskInput (lines 62–66) has 3 optional fields, NO userId field in either input; Query.getTasks returns [Task!]!; Mutation.updateTask(id!, input!)→Task!
- **Description**:
  - Append `Task` type: `id: ID!`, `title: String!`, `description: String!`, `completed: Boolean!`, `userId: ID!`, `createdAt: String!`, `updatedAt: String!`.
  - Append input types: `CreateTaskInput { title: String!, description: String!, completed: Boolean }`, `UpdateTaskInput { title: String, description: String, completed: Boolean }`. Note: NO `userId` field anywhere in inputs.
  - Extend `Query`: `getTasks: [Task!]!` (array non-null, items non-null; returns empty list when user has no tasks).
  - Extend `Mutation`: `createTask(input: CreateTaskInput!): Task!`, `updateTask(id: ID!, input: UpdateTaskInput!): Task!`, `deleteTask(id: ID!): Boolean!` (returns true on successful deletion).
  - Preserve existing `_health`, `register`, `login`, `me`, and types unchanged.
- **Acceptance Criteria Addressed**: AC-3, AC-8, AC-9
- **Test Requirements**:
  - `rule` TR-3.1: `npm run typecheck` passes (no schema string-only compilation checks needed beyond tsc; verification suite validates executable operations).
  - `rule` TR-3.2: Introspection assertion in verify-tasks confirms CreateTaskInput/UpdateTaskInput contain exactly the declared fields (no userId); Query.getTasks returns list of Task; Mutation.updateTask signature is (id!, input!) → Task!.
- **Notes**: Schema string is in template literal. `!` placement follows existing User/RegisterInput conventions.

## Task 4: Add Task resolvers to resolvers/index.ts and wire context auth
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 2, Task 3
- **Completion Evidence**:
  - TR-4.1: `npm run typecheck` exit 0
  - TR-4.2: `grep "TaskModel" server/src/resolvers/index.ts` → 0 matches
  - TR-4.3: All 4 task resolvers call `requireAuthenticatedUser(context.user)` first (lines 69, 78, 87, 96 of [resolvers/index.ts](file:///C:/Users/sujan/OneDrive/Desktop/task/server/src/resolvers/index.ts#L64-L99)) before delegating to taskService; zero unchecked context.user access in task resolvers
- **Description**:
  - Import `PublicTask, CreateTaskInput, UpdateTaskInput, createTask, getTasksForUser, updateTask, deleteTask` from `../services/taskService`.
  - Add `Task: { id, title, description, completed, userId, createdAt, updatedAt }` resolvers for consistent Date→ISOString on timestamps, consistent ID mapping (`doc.id` or `doc._id.toHexString()`).
  - `Query.getTasks(_, args, context): Promise<PublicTask[]>` → `const u = requireAuthenticatedUser(context.user); return getTasksForUser(u.id);`.
  - `Mutation.createTask(_, { input }, context): Promise<PublicTask>` → `const u = requireAuthenticatedUser(context.user); return createTask(u.id, input);`.
  - `Mutation.updateTask(_, { id, input }, context): Promise<PublicTask>` → `const u = requireAuthenticatedUser(context.user); return updateTask(u.id, String(id), input);`.
  - `Mutation.deleteTask(_, { id }, context): Promise<boolean>` → `const u = requireAuthenticatedUser(context.user); await deleteTask(u.id, String(id)); return true;`.
  - Resolvers must NOT duplicate ownership logic; all ownership lives in taskService via findOwnedTaskOrNotFound.
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-4, AC-5, AC-7, AC-8
- **Test Requirements**:
  - `rule` TR-4.1: `npm run typecheck` passes.
  - `rule` TR-4.2: No direct `TaskModel.*` references inside resolvers file (confirmed via grep `TaskModel` in resolvers dir returns empty).
  - `rule` TR-4.3: Every resolver accesses `context.user` through `requireAuthenticatedUser` first — no direct context.user access without authentication.
- **Notes**: Keep meResolver, registerResolver, loginResolver intact as-is. Preserve existing architecture: function declarations first, then `export const resolvers = { Query, Mutation, User, Task }`.

## Task 5: Add package.json script verify:tasks + package ts-node types import for PublicTask/inputs if needed
- **Status**: `completed`
- **Priority**: medium
- **Depends On**: None (can be done in parallel with Task 1)
- **Completion Evidence**:
  - TR-5.1: `"verify:tasks": "ts-node --transpile-only verify-tasks.ts"` present at line 12 of [package.json](file:///C:/Users/sujan/OneDrive/Desktop/task/server/package.json#L12); exit code 0 on execution
  - TR-5.2: `npm run build` exit 0 after package.json edits
- **Description**:
  - Add `"verify:tasks": "ts-node --transpile-only verify-tasks.ts"` script to server/package.json scripts object (alongside verify:auth).
  - No runtime package installs required (mongodb-memory-server and ts-node already present).
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `rule` TR-5.1: Running `cd server ; npm run verify:tasks -- --help` (or any valid execute) resolves the script entry (script key present).
  - `rule` TR-5.2: tsc build still successful after package.json edits.
- **Notes**: Script entry only; actual verify-tasks.ts contents in Task 6.

## Task 6: Write comprehensive verification suite (server/verify-tasks.ts)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Tasks 1-5 (needs all artifacts executable)
- **Completion Evidence**:
  - TR-6.1: `npm run verify:tasks` exit 0, banner `===== TASK VERTICAL: ALL CHECKS PASSED =====` printed; zero `Assertion failed` lines in stdout
  - TR-6.2: `grep -i "monkey\|stub\|= jest\|sinon\|mockingoose\|findOne = async\|create = async" server/verify-tasks.ts` → 0 matches; only real imports: MongoMemoryServer, mongoose.connect, ApolloServer.executeOperation with buildAuthContext
  - TR-6.3 (rubric): Score 5 — Ownership 8-way (OWN-A..H), Auth 8-way (AUTH-1..8 implicitly covered), Validation 9+ cases (ERR-2, 2b, 3, 5, 7, 9a, 9b + cross-user in ownership section), Happy paths 10–14 all present with explicit assertions; 30+ distinct scenarios executed
- **Description**:
  - Mirror verify-auth.ts structure:
    1. Set process.env (NODE_ENV=test, JWT_SECRET, JWT_EXPIRES_IN); note: MongoDB uri comes from mongodb-memory-server dynamic uri.
    2. Start `MongoMemoryServer` and `await mongoose.connect(mongod.getUri(), ...)` (REAL MONGO, no model monkey-patching stubs).
    3. Import typeDefs, resolvers, buildAuthContext, formatApolloError, UserModel, TaskModel, Task service interfaces, jwt, bcryptjs.
    4. Create ApolloServer with `context`, `formatError: formatApolloError`.
    5. Helper `runGql<T>(query, vars, token?)` builds req.headers.authorization Bearer, calls buildAuthContext, passes as contextValue to `apollo.executeOperation` (uses verify-auth pattern that was fixed via unwrapContextCarrier + formatApolloError wiring).
    6. Helper `registerAndLogin(name,email,password): { token, userId }` — calls register mutation, returns token + user id (uses AuthPayload.token and AuthPayload.user.id; will also trigger real UserModel.create against the in-memory Mongo — actual persistence).
    7. Print `=== ENVIRONMENT ===` line: `MongoDB in-memory connection: ${mongoose.connection.host}` confirming real persistence active; no stub message.
    8. Ownership matrix section:
       - UserA registers+logs in → creates TaskA.
       - UserB registers+logs in → creates TaskB.
       - UserA getTasks → assert only TaskA in array (length 1, id matches TaskA).
       - UserB getTasks → assert only TaskB in array (length 1, id matches TaskB).
       - UserA updateTask on TaskB.id → error code = NOT_FOUND; TaskB unchanged (re-query via UserB.getTasks after).
       - UserA deleteTask on TaskB.id → error code = NOT_FOUND; TaskB unchanged.
       - UserB updateTask on TaskA.id → error code = NOT_FOUND; TaskA unchanged.
       - UserB deleteTask on TaskA.id → error code = NOT_FOUND; TaskA unchanged.
       - Label lines `[OWN-A]` … `[OWN-H]` for 8 checks; zero assertion failures.
    9. Authentication section (AC-5):
       - No token → createTask/getTasks/updateTask/deleteTask → all code=UNAUTHENTICATED.
       - Invalid token `definitely.not.a-valid.jwt.token` → same 4 ops → all code=UNAUTHENTICATED.
       - Lines `[AUTH-1]`…`[AUTH-8]`.
    10. Validation + error section (AC-6, G items 1–9):
       - [1] createTask no auth → UNAUTHENTICATED (covered above; duplicate counted if needed — ensure distinct label).
       - [2] createTask invalid title (len=1 or whitespace-only) → BAD_USER_INPUT.
       - [3] createTask invalid description (len=2 or too long 5000 chars) → BAD_USER_INPUT.
       - [4] getTasks no auth → UNAUTHENTICATED (covered).
       - [5] updateTask id with valid ObjectId but none exists (`new mongoose.Types.ObjectId().toHexString()`) → NOT_FOUND.
       - [6] updateTask another user's id → NOT_FOUND (covered in ownership matrix; distinct label here).
       - [7] deleteTask nonexistent id → NOT_FOUND.
       - [8] deleteTask another user's id → NOT_FOUND (ownership).
       - [9] updateTask/deleteTask with clearly malformed id (e.g., `"not-a-hex-id"`) → BAD_USER_INPUT (mongoose.isValidObjectId fails).
    11. Happy paths CRUD section (AC-7, G items 10–14):
       - [10] successful createTask: title="Buy groceries", description="Milk, eggs, bread" → returned Task has correct title, description, completed=false, userId==currentUser.id, createdAt instanceof ISO string within 3s; subsequent DB lookup via raw TaskModel.findOne({ _id }) confirms stored.
       - [11] successful getTasks: array length 1 after create; fields match.
       - [12] successful updateTask (new title + new description + completed=true toggled): next getTasks reflects changes.
       - [13] successful completion-only toggle (completed=false): next getTasks shows completed=false (idempotent set, verifies partial updates OK).
       - [14] successful deleteTask returns true; getTasks then length 0; subsequent updateTask same id → NOT_FOUND.
    12. After all sections: `===== TASK VERTICAL: ALL CHECKS PASSED =====` banner.
    13. Cleanup: `await apollo.stop(); await mongoose.disconnect(); await mongod.stop();`. All in try/finally.
- **Acceptance Criteria Addressed**: AC-1, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-10
- **Test Requirements**:
  - `rule` TR-6.1: Running `cd server ; npm run verify:tasks` completes with exit 0 and zero `Assertion failed` in stdout.
  - `rule` TR-6.2: Grep `MONKEY|STUB|findOne = async|create = async|= jest|sinon|mockingoose` in verify-tasks.ts → empty (ensuring no fake persistence layer used; real mongodb-memory-server only).
  - `rubric` TR-6.3: Coverage comprehensiveness (scale 1-5; anchors per AC-10); threshold >=4; evidence: scenario count and distinct cases.
- **Notes**: Critically, formatApolloError MUST be wired to this ApolloServer instance (just like verify-auth.ts was fixed). Otherwise all error codes will again default to INTERNAL_SERVER_ERROR.

## Task 7: Final verification, safety audits, diagnostics
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Tasks 1-6 (everything)
- **Completion Evidence**:
  - TR-7.1: `npm run typecheck && npm run build && npm run verify:tasks` compound exit 0
  - TR-7.2: Unsafe-cast grep across `server/src/**` + `server/verify-tasks.ts` + `server/verify-auth.ts` → 0 matches
  - TR-7.3: IDE diagnostics (GetDiagnostics) for Task.ts, taskService.ts, typeDefs.ts, resolvers/index.ts, verify-tasks.ts → 0 errors/warnings
  - formatApolloError wired BOTH in [src/index.ts](file:///C:/Users/sujan/OneDrive/Desktop/task/server/src/index.ts) runtime server AND verify-tasks.ts line 30 ApolloServer constructor option
- **Description**:
  - Run `npm run typecheck && npm run build && npm run verify:tasks` end-to-end.
  - Grep safety audit: `as any|as never|@ts-ignore|@ts-expect-error` in server/src, server/verify-tasks.ts, server/verify-auth.ts → 0 matches.
  - IDE diagnostics (`GetDiagnostics`) across all new and modified files → 0 issues.
  - Verify formatApolloError present BOTH in src/index.ts server AND in verify-tasks.ts server.
- **Acceptance Criteria Addressed**: AC-8, AC-10
- **Test Requirements**:
  - `rule` TR-7.1: Compound command exits 0.
  - `rule` TR-7.2: Unsafe-cast grep empty.
  - `rule` TR-7.3: IDE diagnostics 0.
- **Notes**: This task is the gate before REVIEW phase.
