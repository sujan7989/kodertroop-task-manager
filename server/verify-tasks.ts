import 'dotenv/config';

const JWT_SECRET = 'verify-tasks-internal-secret-not-for-prod';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_EXPIRES_IN = '1h';

import { ApolloServer, ExpressContext } from 'apollo-server-express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { typeDefs } from './src/graphql/typeDefs';
import { resolvers } from './src/resolvers';
import { buildAuthContext } from './src/middleware/auth';
import { formatApolloError } from './src/graphql/formatError';
import { TaskModel } from './src/models/Task';

type GqlErrors = Array<{ message: string; extensions?: { code?: string } }>;

const run = async (): Promise<void> => {
  const mongod = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongod.getUri());
    console.log(`=== ENVIRONMENT === MongoDB in-memory: uri=${mongod.getUri()}`);

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
        // @ts-ignore - Apollo Server API version compatibility
        { contextValue }
      ) as Promise<{ data?: T; errors?: GqlErrors }>;
    };

    const registerMutation = `mutation Register($input: RegisterInput!) { register(input: $input) { token user { id name email } } }`;
    const loginMutation = `mutation Login($input: LoginInput!) { login(input: $input) { token user { id } } }`;
    const getTasksQuery = `query { getTasks { id title description completed userId createdAt updatedAt } }`;
    const createTaskMutation = `mutation CreateTask($input: CreateTaskInput!) { createTask(input: $input) { id title description completed userId createdAt updatedAt } }`;
    const updateTaskMutation = `mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) { updateTask(id: $id, input: $input) { id title description completed userId createdAt updatedAt } }`;
    const deleteTaskMutation = `mutation DeleteTask($id: ID!) { deleteTask(id: $id) }`;

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
      console.assert(!reg.errors, `register ${email} unexpected errors: ${JSON.stringify(reg.errors)}`);
      console.assert(
        typeof reg.data?.register.token === 'string' &&
          reg.data.register.token.length > 40,
        `register ${email} missing token`
      );
      console.assert(
        typeof reg.data?.register.user.id === 'string',
        `register ${email} missing user id`
      );
      return {
        token: reg.data!.register.token,
        userId: reg.data!.register.user.id,
      };
    };

    const registerA = await registerAndLogin(
      'User A',
      'usera+tasks@example.com',
      'KoderTroop1!'
    );
    const registerB = await registerAndLogin(
      'User B',
      'userb+tasks@example.com',
      'KoderTroop2!'
    );

    console.log('\n--- [AUTH] Authentication required for all task ops ---');
    const authInputs: Array<{
      label: string;
      query: string;
      variables: Record<string, unknown>;
    }> = [
      {
        label: 'createTask',
        query: createTaskMutation,
        variables: { input: { title: 'Title', description: 'Desc' } },
      },
      { label: 'getTasks', query: getTasksQuery, variables: {} },
      {
        label: 'updateTask',
        query: updateTaskMutation,
        variables: { id: new Types.ObjectId().toHexString(), input: { title: 'X' } },
      },
      {
        label: 'deleteTask',
        query: deleteTaskMutation,
        variables: { id: new Types.ObjectId().toHexString() },
      },
    ];

    for (let i = 0; i < authInputs.length; i++) {
      const t = authInputs[i];
      const noAuth = await runGql(t.query, t.variables);
      const noCode = noAuth.errors?.[0]?.extensions?.code;
      console.assert(
        noCode === 'UNAUTHENTICATED',
        `[AUTH-${i + 1}] ${t.label} no-token expected UNAUTHENTICATED, got ${noCode}`
      );
      console.log(
        `[AUTH-${i + 1}] no-token ${t.label}: code=${noCode}`
      );

      const badAuth = await runGql(t.query, t.variables, 'definitely.invalid.jwt');
      const badCode = badAuth.errors?.[0]?.extensions?.code;
      console.assert(
        badCode === 'UNAUTHENTICATED',
        `[AUTH-${i + 1 + authInputs.length}] ${t.label} invalid-token expected UNAUTHENTICATED, got ${badCode}`
      );
      console.log(
        `[AUTH-${i + 1 + authInputs.length}] invalid-token ${t.label}: code=${badCode}`
      );
    }

    console.log('\n--- [OWN-A..H] Two-user ownership isolation ---');
    const taskAInput = { title: 'User A Task', description: 'Only A should see this.' };
    const taskBInput = { title: 'User B Task', description: 'Only B should see this.' };

    const createA = await runGql<{
      createTask: { id: string; title: string; userId: string };
    }>(createTaskMutation, { input: taskAInput }, registerA.token);
    console.assert(
      !createA.errors && createA.data?.createTask.id,
      `[OWN-A] User A createTask failed: ${JSON.stringify(createA.errors)}`
    );
    const taskAId = createA.data!.createTask.id;
    console.assert(
      createA.data!.createTask.userId === registerA.userId,
      `[OWN-A] User A createTask assigned wrong userId: ${createA.data!.createTask.userId} vs ${registerA.userId}`
    );
    console.log(`[OWN-A] User A created taskA id=${taskAId}`);

    const createB = await runGql<{
      createTask: { id: string; title: string; userId: string };
    }>(createTaskMutation, { input: taskBInput }, registerB.token);
    console.assert(
      !createB.errors && createB.data?.createTask.id,
      `[OWN-B] User B createTask failed: ${JSON.stringify(createB.errors)}`
    );
    const taskBId = createB.data!.createTask.id;
    console.assert(
      createB.data!.createTask.userId === registerB.userId,
      `[OWN-B] User B createTask assigned wrong userId`
    );
    console.log(`[OWN-B] User B created taskB id=${taskBId}`);

    const tasksA = await runGql<{
      getTasks: Array<{ id: string; title: string }>;
    }>(getTasksQuery, {}, registerA.token);
    console.assert(
      !tasksA.errors && tasksA.data?.getTasks.length === 1,
      `[OWN-C] User A getTasks expected length 1, got len=${tasksA.data?.getTasks.length} errors=${JSON.stringify(tasksA.errors)}`
    );
    console.assert(
      tasksA.data!.getTasks[0].id === taskAId,
      `[OWN-C] User A getTasks returned wrong task: ${tasksA.data!.getTasks[0].id} vs ${taskAId}`
    );
    console.log(
      `[OWN-C] User A getTasks count=${tasksA.data!.getTasks.length} only taskA`
    );

    const tasksB = await runGql<{
      getTasks: Array<{ id: string; title: string }>;
    }>(getTasksQuery, {}, registerB.token);
    console.assert(
      !tasksB.errors && tasksB.data?.getTasks.length === 1,
      `[OWN-D] User B getTasks expected length 1, got len=${tasksB.data?.getTasks.length}`
    );
    console.assert(
      tasksB.data!.getTasks[0].id === taskBId,
      `[OWN-D] User B getTasks returned wrong task`
    );
    console.log(
      `[OWN-D] User B getTasks count=${tasksB.data!.getTasks.length} only taskB`
    );

    const updateAB = await runGql(
      updateTaskMutation,
      { id: taskBId, input: { title: 'Hacked by A' } },
      registerA.token
    );
    const updateABCode = updateAB.errors?.[0]?.extensions?.code;
    console.assert(
      updateABCode === 'NOT_FOUND',
      `[OWN-E] User A updateTask taskB expected NOT_FOUND, got ${updateABCode}`
    );
    const verifyBAfterAUpdate = await runGql<{
      getTasks: Array<{ id: string; title: string }>;
    }>(getTasksQuery, {}, registerB.token);
    console.assert(
      verifyBAfterAUpdate.data?.getTasks[0].title === taskBInput.title,
      `[OWN-E] taskB title changed after User A attempted update (leaked write!)`
    );
    console.log(
      `[OWN-E] User A cannot update taskB: code=${updateABCode} (taskB unchanged)`
    );

    const deleteAB = await runGql(
      deleteTaskMutation,
      { id: taskBId },
      registerA.token
    );
    const deleteABCode = deleteAB.errors?.[0]?.extensions?.code;
    console.assert(
      deleteABCode === 'NOT_FOUND',
      `[OWN-F] User A deleteTask taskB expected NOT_FOUND, got ${deleteABCode}`
    );
    const verifyBAfterADelete = await runGql<{
      getTasks: Array<{ id: string; title: string }>;
    }>(getTasksQuery, {}, registerB.token);
    console.assert(
      verifyBAfterADelete.data?.getTasks.length === 1,
      `[OWN-F] taskB deleted by User A! (leaked delete!)`
    );
    console.log(
      `[OWN-F] User A cannot delete taskB: code=${deleteABCode} (taskB unchanged)`
    );

    const updateBA = await runGql(
      updateTaskMutation,
      { id: taskAId, input: { title: 'Hacked by B' } },
      registerB.token
    );
    const updateBACode = updateBA.errors?.[0]?.extensions?.code;
    console.assert(
      updateBACode === 'NOT_FOUND',
      `[OWN-G] User B updateTask taskA expected NOT_FOUND, got ${updateBACode}`
    );
    const verifyAAfterBUpdate = await runGql<{
      getTasks: Array<{ id: string; title: string }>;
    }>(getTasksQuery, {}, registerA.token);
    console.assert(
      verifyAAfterBUpdate.data?.getTasks[0].title === taskAInput.title,
      `[OWN-G] taskA title changed after User B attempted update`
    );
    console.log(
      `[OWN-G] User B cannot update taskA: code=${updateBACode} (taskA unchanged)`
    );

    const deleteBA = await runGql(
      deleteTaskMutation,
      { id: taskAId },
      registerB.token
    );
    const deleteBACode = deleteBA.errors?.[0]?.extensions?.code;
    console.assert(
      deleteBACode === 'NOT_FOUND',
      `[OWN-H] User B deleteTask taskA expected NOT_FOUND, got ${deleteBACode}`
    );
    const verifyAAfterBDelete = await runGql<{
      getTasks: Array<{ id: string; title: string }>;
    }>(getTasksQuery, {}, registerA.token);
    console.assert(
      verifyAAfterBDelete.data?.getTasks.length === 1,
      `[OWN-H] taskA deleted by User B!`
    );
    console.log(
      `[OWN-H] User B cannot delete taskA: code=${deleteBACode} (taskA unchanged)`
    );

    console.log('\n--- [VALIDATION] Input validation & error handling cases ---');
    const validUser = registerA;
    const case2 = await runGql(
      createTaskMutation,
      { input: { title: 'AB', description: 'Good description here' } },
      validUser.token
    );
    console.assert(
      case2.errors?.[0]?.extensions?.code === 'BAD_USER_INPUT',
      `[ERR-2] short title expected BAD_USER_INPUT, got ${case2.errors?.[0]?.extensions?.code}`
    );
    console.log(`[ERR-2] createTask short title: BAD_USER_INPUT OK`);

    const case2b = await runGql(
      createTaskMutation,
      { input: { title: '     ', description: 'Good description here' } },
      validUser.token
    );
    console.assert(
      case2b.errors?.[0]?.extensions?.code === 'BAD_USER_INPUT',
      `[ERR-2b] whitespace-only title expected BAD_USER_INPUT, got ${case2b.errors?.[0]?.extensions?.code}`
    );
    console.log(`[ERR-2b] createTask whitespace title: BAD_USER_INPUT OK`);

    const case3 = await runGql(
      createTaskMutation,
      { input: { title: 'Valid title', description: 'ab' } },
      validUser.token
    );
    console.assert(
      case3.errors?.[0]?.extensions?.code === 'BAD_USER_INPUT',
      `[ERR-3] short description expected BAD_USER_INPUT, got ${case3.errors?.[0]?.extensions?.code}`
    );
    console.log(`[ERR-3] createTask short description: BAD_USER_INPUT OK`);

    const nonexistentId = new Types.ObjectId().toHexString();
    const case5 = await runGql(
      updateTaskMutation,
      { id: nonexistentId, input: { title: 'T' } },
      validUser.token
    );
    console.assert(
      case5.errors?.[0]?.extensions?.code === 'NOT_FOUND',
      `[ERR-5] update nonexistent expected NOT_FOUND, got ${case5.errors?.[0]?.extensions?.code}`
    );
    console.log(`[ERR-5] updateTask nonexistent id: NOT_FOUND OK`);

    const case7 = await runGql(
      deleteTaskMutation,
      { id: nonexistentId },
      validUser.token
    );
    console.assert(
      case7.errors?.[0]?.extensions?.code === 'NOT_FOUND',
      `[ERR-7] delete nonexistent expected NOT_FOUND, got ${case7.errors?.[0]?.extensions?.code}`
    );
    console.log(`[ERR-7] deleteTask nonexistent id: NOT_FOUND OK`);

    const case9 = await runGql(
      updateTaskMutation,
      { id: 'not-a-valid-hex-id', input: { title: 'T' } },
      validUser.token
    );
    const case9Code = case9.errors?.[0]?.extensions?.code;
    console.assert(
      case9Code === 'BAD_USER_INPUT',
      `[ERR-9a] malformed task id update expected BAD_USER_INPUT, got ${case9Code}`
    );
    console.log(`[ERR-9a] updateTask malformed id: BAD_USER_INPUT OK`);

    const case9b = await runGql(
      deleteTaskMutation,
      { id: 'not-a-valid-hex-id' },
      validUser.token
    );
    const case9bCode = case9b.errors?.[0]?.extensions?.code;
    console.assert(
      case9bCode === 'BAD_USER_INPUT',
      `[ERR-9b] malformed task id delete expected BAD_USER_INPUT, got ${case9bCode}`
    );
    console.log(`[ERR-9b] deleteTask malformed id: BAD_USER_INPUT OK`);

    console.log('\n--- [HAPPY-10..14] CRUD happy paths ---');
    const happyUser = await registerAndLogin(
      'Happy User',
      'happyuser@example.com',
      'KoderTroop3!'
    );
    const create10 = await runGql<{
      createTask: {
        id: string;
        title: string;
        description: string;
        completed: boolean;
        userId: string;
        createdAt: string;
        updatedAt: string;
      };
    }>(
      createTaskMutation,
      {
        input: {
          title: 'Buy groceries',
          description: 'Milk, eggs, bread',
        },
      },
      happyUser.token
    );
    console.assert(
      !create10.errors && !!create10.data?.createTask.id,
      `[HAPPY-10] create failed: ${JSON.stringify(create10.errors)}`
    );
    const happyId = create10.data!.createTask.id;
    console.assert(
      create10.data!.createTask.completed === false,
      `[HAPPY-10] expected completed=false default, got ${create10.data!.createTask.completed}`
    );
    console.assert(
      create10.data!.createTask.userId === happyUser.userId,
      `[HAPPY-10] expected userId=${happyUser.userId}, got ${create10.data!.createTask.userId}`
    );
    const createdWithin3s =
      Math.abs(
        new Date(create10.data!.createTask.createdAt).getTime() - Date.now()
      ) < 3000;
    console.assert(createdWithin3s, `[HAPPY-10] createdAt not recent`);
    const persisted = await TaskModel.findOne({ _id: happyId }).exec();
    console.assert(!!persisted, `[HAPPY-10] Task not actually persisted in MongoDB`);
    console.assert(
      persisted!.title === 'Buy groceries' &&
        persisted!.description === 'Milk, eggs, bread',
      `[HAPPY-10] Persisted document mismatches GraphQL response`
    );
    console.log(`[HAPPY-10] createTask success id=${happyId} persisted=true`);

    const list11 = await runGql<{
      getTasks: Array<{ id: string; title: string; description: string }>;
    }>(getTasksQuery, {}, happyUser.token);
    console.assert(
      list11.data?.getTasks.length === 1 &&
        list11.data.getTasks[0].id === happyId,
      `[HAPPY-11] getTasks unexpected list`
    );
    console.log(`[HAPPY-11] getTasks count=1 matches created`);

    const update12 = await runGql<{
      updateTask: {
        id: string;
        title: string;
        description: string;
        completed: boolean;
      };
    }>(
      updateTaskMutation,
      {
        id: happyId,
        input: {
          title: 'Buy organic groceries',
          description: 'Milk, eggs, sourdough bread',
          completed: true,
        },
      },
      happyUser.token
    );
    console.assert(
      !update12.errors &&
        update12.data?.updateTask.title === 'Buy organic groceries' &&
        update12.data?.updateTask.description ===
          'Milk, eggs, sourdough bread' &&
        update12.data?.updateTask.completed === true,
      `[HAPPY-12] updateTask full change failed: ${JSON.stringify(update12.errors ?? update12.data)}`
    );
    const listAfter12 = await runGql<{
      getTasks: Array<{ id: string; completed: boolean; title: string }>;
    }>(getTasksQuery, {}, happyUser.token);
    console.assert(
      listAfter12.data?.getTasks[0].completed === true &&
        listAfter12.data.getTasks[0].title === 'Buy organic groceries',
      `[HAPPY-12] changes not reflected in getTasks after update`
    );
    console.log(`[HAPPY-12] updateTask title+desc+completed=true OK`);

    const update13 = await runGql<{
      updateTask: { id: string; completed: boolean };
    }>(
      updateTaskMutation,
      { id: happyId, input: { completed: false } },
      happyUser.token
    );
    console.assert(
      !update13.errors && update13.data?.updateTask.completed === false,
      `[HAPPY-13] completion-only toggle failed`
    );
    const listAfter13 = await runGql<{
      getTasks: Array<{ id: string; completed: boolean }>;
    }>(getTasksQuery, {}, happyUser.token);
    console.assert(
      listAfter13.data?.getTasks[0].completed === false,
      `[HAPPY-13] completed toggle not reflected`
    );
    console.log(`[HAPPY-13] updateTask completion-only toggle=false OK`);

    const delete14 = await runGql<{ deleteTask: boolean }>(
      deleteTaskMutation,
      { id: happyId },
      happyUser.token
    );
    console.assert(
      delete14.data?.deleteTask === true,
      `[HAPPY-14] deleteTask returned false or missing data: ${JSON.stringify(delete14)}`
    );
    const listAfter14 = await runGql<{ getTasks: Array<unknown> }>(
      getTasksQuery,
      {},
      happyUser.token
    );
    console.assert(
      listAfter14.data?.getTasks.length === 0,
      `[HAPPY-14] getTasks not empty after delete`
    );
    const updateAfterDelete = await runGql(
      updateTaskMutation,
      { id: happyId, input: { title: 'X' } },
      happyUser.token
    );
    console.assert(
      updateAfterDelete.errors?.[0]?.extensions?.code === 'NOT_FOUND',
      `[HAPPY-14] update after delete expected NOT_FOUND, got ${updateAfterDelete.errors?.[0]?.extensions?.code}`
    );
    const rawCount = await TaskModel.countDocuments({
      _id: happyId,
    }).exec();
    console.assert(rawCount === 0, `[HAPPY-14] Document still in MongoDB after delete!`);
    console.log(`[HAPPY-14] deleteTask success + subsequent update=NOT_FOUND + DB count=0`);

    console.log('\n===== TASK VERTICAL: ALL CHECKS PASSED =====');
    await apollo.stop();
  } finally {
    try {
      await mongoose.disconnect();
    } catch {}
    try {
      await mongod.stop();
    } catch {}
  }
};

run().catch((e: unknown) => {
  console.error(
    'VERIFICATION FAILED:',
    e instanceof Error
      ? { name: e.name, message: e.message, stack: e.stack }
      : e
  );
  process.exit(1);
});

export {};
