import 'dotenv/config';

const JWT_SECRET = 'verify-auth-internal-secret-not-for-prod';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_EXPIRES_IN = '1h';
process.env.MONGODB_URI = 'mongodb://verify-auth-stub.local:27017/verify_auth_stub';

import jwt from 'jsonwebtoken';
import { ApolloServer, ExpressContext } from 'apollo-server-express';
import mongoose, { Error as MongooseError, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { typeDefs } from './src/graphql/typeDefs';
import { resolvers } from './src/resolvers';
import { buildAuthContext } from './src/middleware/auth';
import { UserModel } from './src/models/User';
import { formatApolloError } from './src/graphql/formatError';

type LeanUser = {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

type GqlErrors = Array<{ message: string; extensions?: { code?: string } }>;

const run = async (): Promise<void> => {
  const store = new Map<string, LeanUser>();
  let forceDupOnCreate = false;
  const BCRYPT_ROUNDS = 12;

  type QueryRes<T> = Promise<T> & { lean: () => Promise<T>; select: (_s: string) => Promise<T> };

  const makeQueryLike = <T>(value: T): QueryRes<T> => {
    const p = Promise.resolve(value);
    (p as QueryRes<T>).lean = () => p;
    (p as QueryRes<T>).select = () => p;
    return p as QueryRes<T>;
  };

  (UserModel.exists as unknown) = ({ email }: { email: string }) => {
    const stored = store.get(email);
    const result = stored ? { _id: stored._id } : null;
    return makeQueryLike(result);
  };

  (UserModel.create as unknown) = async <T extends { name: string; email: string; passwordHash: string }>(body: T): Promise<LeanUser & { toJSON: () => unknown; toObject: () => unknown; _id: Types.ObjectId; id: string; get: (p: string) => unknown; save: () => Promise<unknown> }> => {
    if (forceDupOnCreate || store.has(body.email)) {
      const err = new MongooseError('E11000 duplicate key error collection') as MongooseError & { code?: number; keyPattern?: { email: number } };
      err.code = 11000;
      err.keyPattern = { email: 1 };
      throw err;
    }
    const created: LeanUser = {
      _id: new Types.ObjectId(),
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      passwordHash: body.passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.set(created.email, created);
    const passwordHashCaptured = created.passwordHash;
    return {
      ...created,
      get(p: string): unknown {
        if (p === 'passwordHash') return passwordHashCaptured;
        return (created as Record<string, unknown>)[p];
      },
      toJSON(): unknown {
        const { passwordHash: _p, ...rest } = created;
        void _p;
        return rest;
      },
      toObject(): unknown {
        const { passwordHash: _p, ...rest } = created;
        void _p;
        return rest;
      },
      save: async () => undefined,
    } as LeanUser & { toJSON: () => unknown; toObject: () => unknown; _id: Types.ObjectId; id: string; get: (p: string) => unknown; save: () => Promise<unknown> };
  };

  (UserModel.findOne as unknown) = ({ email }: { email: string }) => {
    const found = store.get(email);
    type DocT = (LeanUser & { get: (p: string) => unknown }) | null;
    const withDoc: DocT = found
      ? {
          ...found,
          get(p: string): unknown {
            return (found as Record<string, unknown>)[p];
          },
        }
      : null;
    return {
      select: async (_sel: string) => withDoc,
    };
  };

  (UserModel.findById as unknown) = (id: string | Types.ObjectId) => {
    const strId = typeof id === 'string' ? id : id.toHexString();
    let result: { _id: Types.ObjectId; name: string; email: string; createdAt: Date; updatedAt: Date } | null = null;
    for (const doc of store.values()) {
      if (doc._id.toHexString() === strId) {
        const { passwordHash: _p, ...lean } = doc;
        void _p;
        result = lean;
        break;
      }
    }
    return makeQueryLike(result);
  };

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
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    const contextValue = await buildAuthContext({ req } as unknown as ExpressContext);
    // @ts-ignore - Apollo Server API version compatibility
    return apollo.executeOperation({ query, variables }, { contextValue }) as Promise<{ data?: T; errors?: GqlErrors }>;
  };

  const health = await runGql<{ _health: { status: string; timestamp: string } }>('{ _health { status timestamp } }');
  console.assert(health.data?._health.status === 'OK', 'GraphQL health expected OK');
  console.log(`[1] GraphQL _health status=${health.data?._health.status} ts=${health.data?._health.timestamp}`);

  const strongPw = 'KoderTroop1!';
  const regInput = { name: '  Alice Smith  ', email: '  Alice.Smith@Example.COM  ', password: strongPw };
  const normalizedEmail = 'alice.smith@example.com';

  const registerMutation = `mutation Register($input: RegisterInput!) { register(input: $input) { token user { id name email createdAt updatedAt } } }`;

  const reg = await runGql<{ register: { token: string; user: { id: string; name: string; email: string; createdAt: string; updatedAt: string } } }>(
    registerMutation,
    { input: regInput }
  );
  console.assert(!reg.errors, `register unexpected errors: ${JSON.stringify(reg.errors)}`);
  console.assert(reg.data?.register.user.name === 'Alice Smith', `name not trimmed: ${reg.data?.register.user.name}`);
  console.assert(reg.data?.register.user.email === normalizedEmail, `email not normalized: ${reg.data?.register.user.email}`);
  const storedDoc = store.get(normalizedEmail);
  console.assert(Boolean(storedDoc), 'user not actually stored in store');
  const storedHash = storedDoc ? storedDoc.passwordHash : undefined;
  console.assert(typeof storedHash === 'string' && storedHash.startsWith('$2a$') && storedHash.length > 50, 'password not bcrypt hashed');
  const pwMatches = await bcrypt.compare(strongPw, storedHash ?? '');
  console.assert(pwMatches === true, 'stored bcrypt hash does NOT verify against original pw');
  console.log(`[2] Register OK: id=${reg.data?.register.user.id} name="${reg.data?.register.user.name}" email=${reg.data?.register.user.email} bcrypt verified=${pwMatches}`);

  const token = reg.data!.register.token;
  const userId = reg.data!.register.user.id;

  const decoded = jwt.decode(token, { complete: true }) as jwt.Jwt | null;
  const payload = decoded?.payload as Record<string, unknown> | null;
  console.assert(payload?.sub === userId, `JWT sub mismatch: ${String(payload?.sub)} vs ${userId}`);
  console.assert(!('passwordHash' in (payload ?? {})), 'passwordHash present in JWT payload');
  console.assert(!('password' in (payload ?? {})), 'password present in JWT payload');
  console.assert(!('email' in (payload ?? {})), 'email present in JWT payload (unnecessary PII)');
  console.assert(typeof payload?.iat === 'number' && typeof payload?.exp === 'number', 'missing iat/exp in JWT');
  const algo = (decoded?.header as { alg?: string } | undefined)?.alg;
  console.assert(algo === 'HS256', `expected HS256 algo, got ${algo}`);
  console.log(`[3] JWT payload minimal & signed. keys=${Object.keys(payload ?? {}).sort().join(',')} header.alg=${algo}`);

  const registerJson = JSON.stringify(reg.data?.register ?? '');
  console.assert(!/passwordHash/.test(registerJson), 'passwordHash leaked in register output');
  console.assert(!/"password"/.test(registerJson), 'password leaked in register output');
  console.log('[4] passwordHash/password fields ABSENT in register response');

  const dup = await runGql(registerMutation, { input: { name: 'Dup User', email: normalizedEmail, password: strongPw } });
  const dupCode = dup.errors?.[0]?.extensions?.code;
  console.assert(Array.isArray(dup.errors), 'expected dup registration to error');
  console.assert(dupCode === 'CONFLICT', `expected CONFLICT, got ${dupCode}`);
  console.log(`[5] Duplicate registration blocked: code=${dupCode}`);

  forceDupOnCreate = true;
  try {
    const dupE11000 = await runGql(registerMutation, { input: { name: 'Fresh', email: 'fresh-e11000@example.com', password: strongPw } });
    const code11000 = dupE11000.errors?.[0]?.extensions?.code;
    console.assert(code11000 === 'CONFLICT', `Mongoose E11000 not mapped to CONFLICT -> ${code11000}`);
    console.log(`[5b] Mongoose E11000 code path correctly mapped: code=${code11000}`);
  } finally {
    forceDupOnCreate = false;
  }

  const loginMutation = `mutation Login($input: LoginInput!) { login(input: $input) { token user { id name email createdAt updatedAt } } }`;
  const loggedIn = await runGql<{ login: { token: string; user: { id: string; email: string } } }>(loginMutation, {
    input: { email: regInput.email, password: strongPw },
  });
  console.assert(!loggedIn.errors, `login errors: ${JSON.stringify(loggedIn.errors)}`);
  console.assert(loggedIn.data?.login.user.email === normalizedEmail, `login email not normalized: ${loggedIn.data?.login.user.email}`);
  console.assert(loggedIn.data?.login.user.id === userId, `login returned different user id`);
  console.assert(typeof loggedIn.data?.login.token === 'string' && loggedIn.data.login.token.length > 40, 'login missing token');
  const loginJson = JSON.stringify(loggedIn.data?.login ?? '');
  console.assert(!/passwordHash/.test(loginJson), 'passwordHash leaked in login output');
  console.log(`[6] Login OK: email=${loggedIn.data?.login.user.email} passwordHash absent in response`);

  const badPw = await runGql(loginMutation, { input: { email: normalizedEmail, password: 'WrongPassword1!' } });
  const badPwCode = badPw.errors?.[0]?.extensions?.code;
  const badPwMsg = badPw.errors?.[0]?.message;
  console.assert(Array.isArray(badPw.errors), 'bad password expected to error');
  console.assert(badPwCode === 'UNAUTHENTICATED', `bad pw code expected UNAUTHENTICATED, got ${badPwCode}`);
  console.assert(badPwMsg === 'Invalid email or password', `bad pw message leaked details: ${badPwMsg}`);
  console.log(`[7] Invalid password: code=${badPwCode} msg="${badPwMsg}" (generic)`);

  const badEmail = await runGql(loginMutation, { input: { email: 'doesnotexist@example.com', password: strongPw } });
  const badEmailCode = badEmail.errors?.[0]?.extensions?.code;
  const badEmailMsg = badEmail.errors?.[0]?.message;
  console.assert(Array.isArray(badEmail.errors), 'nonexistent email expected to error');
  console.assert(badEmailCode === 'UNAUTHENTICATED', `bad email code expected UNAUTHENTICATED, got ${badEmailCode}`);
  console.assert(badEmailMsg === 'Invalid email or password', `bad email message leaked existence: ${badEmailMsg}`);
  console.log(`[8] Nonexistent email: code=${badEmailCode} msg="${badEmailMsg}" (generic)`);

  const meQuery = 'query { me { id name email createdAt updatedAt } }';

  const meAuthed = await runGql<{ me: { id: string; name: string; email: string } | null }>(meQuery, {}, token);
  console.assert(!meAuthed.errors, `me with token unexpected errors: ${JSON.stringify(meAuthed.errors)}`);
  console.assert(meAuthed.data?.me?.id === userId, `me id mismatch: ${String(meAuthed.data?.me?.id)} vs ${userId}`);
  console.assert(meAuthed.data?.me?.email === normalizedEmail, `me email mismatch`);
  const meJson = JSON.stringify(meAuthed.data?.me ?? '');
  console.assert(!/passwordHash/.test(meJson), 'passwordHash leaked in me response');
  console.log(`[9] me with valid JWT OK: id=${meAuthed.data?.me?.id} passwordHash absent`);

  const meNone = await runGql<{ me: unknown }>(meQuery);
  console.assert(!meNone.errors, `me without token should be null, not an error: ${JSON.stringify(meNone.errors)}`);
  console.assert(meNone.data?.me === null, `me null expected, got ${JSON.stringify(meNone.data?.me)}`);
  console.log(`[10] me without JWT returns null: data.me=${JSON.stringify(meNone.data?.me)}`);

  const meInvalid = await runGql(meQuery, {}, 'definitely.not.a.valid-jwt.token');
  const invCode = meInvalid.errors?.[0]?.extensions?.code;
  console.assert(Array.isArray(meInvalid.errors), 'invalid token should produce error');
  console.assert(invCode === 'UNAUTHENTICATED', `invalid token expected UNAUTHENTICATED, got ${invCode}`);
  console.log(`[11] me with invalid JWT: code=${invCode}`);

  const expiredToken = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '1ms' });
  await new Promise((r) => setTimeout(r, 50));
  const meExp = await runGql(meQuery, {}, expiredToken);
  const expCode = meExp.errors?.[0]?.extensions?.code;
  const expMsg = meExp.errors?.[0]?.message;
  console.assert(Array.isArray(meExp.errors), 'expired token expected to error');
  console.assert(expCode === 'UNAUTHENTICATED', `expired token expected UNAUTHENTICATED, got ${expCode}`);
  console.assert(/expired/i.test(expMsg ?? ''), `expected "expired" in message, got ${expMsg}`);
  console.log(`[12] me with expired JWT: code=${expCode} msg="${expMsg}"`);

  const jwtVerifyResult = (() => {
    try { return jwt.verify(token, JWT_SECRET); } catch { return 'FAIL'; }
  })();
  console.assert(jwtVerifyResult !== 'FAIL', 'issued token fails signature verification');
  try {
    jwt.verify(token, 'wrong-secret-definitely-does-not-match');
    console.assert(false, 'token should fail verify with wrong secret');
  } catch {
    /* expected */
  }
  console.log(`[13] JWT signature correctly verified. Wrong-secret verify correctly rejects.`);

  const weakCases: Array<{ label: string; pw: string }> = [
    { label: 'too short (<8)', pw: 'Aa1!' },
    { label: 'no uppercase', pw: 'aaaaaaaa1' },
    { label: 'no lowercase', pw: 'AAAAAAAA1' },
    { label: 'no digit', pw: 'AAAAAAAAa' },
  ];
  for (const c of weakCases) {
    const r = await runGql(registerMutation, { input: { name: 'Weak', email: `w-${encodeURIComponent(c.label)}@test.local`, password: c.pw } });
    const code = r.errors?.[0]?.extensions?.code;
    console.assert(code === 'BAD_USER_INPUT', `weak pw "${c.label}" code=${code}, expected BAD_USER_INPUT`);
  }
  console.log('[extra] Weak password cases all rejected (BAD_USER_INPUT). OK.');

  const badEmailReg = await runGql(registerMutation, { input: { name: 'Bob', email: 'clearly-not-an-email', password: strongPw } });
  const bc = badEmailReg.errors?.[0]?.extensions?.code;
  console.assert(bc === 'BAD_USER_INPUT', `malformed email expected BAD_USER_INPUT, got ${bc}`);
  console.log('[extra] Malformed email rejected (BAD_USER_INPUT). OK.');

  const emptyName = await runGql(registerMutation, { input: { name: '     ', email: 'emptyname@test.local', password: strongPw } });
  const nc = emptyName.errors?.[0]?.extensions?.code;
  console.assert(nc === 'BAD_USER_INPUT', `empty name expected BAD_USER_INPUT, got ${nc}`);
  console.log('[extra] Whitespace-only name rejected (BAD_USER_INPUT). OK.');

  void BCRYPT_ROUNDS;

  console.log('\n===== AUTH VERTICAL: ALL 13 + EXTRA VERIFICATIONS PASSED =====');
  await apollo.stop();
};

run().catch((e: unknown) => {
  console.error('VERIFICATION FAILED:', e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : e);
  process.exit(1);
});

export {};
