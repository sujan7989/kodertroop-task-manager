import { ExpressContext } from 'apollo-server-express/dist/ApolloServer';
import { resolveAuthenticatedUserFromToken } from '../services/authService';
import { UnauthorizedError, AppError } from '../errors/AppError';
import { PublicUser } from '../services/authService';

export interface AuthContext {
  user?: PublicUser;
  hadToken?: boolean;
  authError?: AppError;
}

const BEARER_PREFIX = 'Bearer ';

const extractBearerToken = (authHeader: string | undefined | string[]): string | null => {
  if (authHeader === undefined || Array.isArray(authHeader)) return null;
  if (!authHeader.startsWith(BEARER_PREFIX)) return null;
  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
};

const extractTokenFromContext = (ctx: ExpressContext | Record<string, unknown> | undefined): string | null => {
  if (ctx === undefined || ctx === null) return null;
  const ctxObj = ctx as Record<string, unknown>;
  const req = ctxObj.req as Record<string, unknown> | undefined;
  if (req === undefined || req === null) return null;
  const headers = req.headers as Record<string, unknown> | undefined;
  if (headers === undefined || headers === null) return null;
  const authHeader =
    typeof headers.authorization === 'string'
      ? headers.authorization
      : undefined;
  return extractBearerToken(authHeader);
};

type UnwrappedCarrier =
  | { type: 'user'; user: PublicUser }
  | { type: 'error'; authError: AppError }
  | { type: 'none' };

const unwrapContextCarrier = (ctx: ExpressContext | Record<string, unknown> | undefined): UnwrappedCarrier => {
  if (ctx === undefined || ctx === null) return { type: 'none' };
  const ctxObj = ctx as Record<string, unknown>;
  const wrapper = ctxObj.contextValue as Record<string, unknown> | undefined;
  const req = ctxObj.req as Record<string, unknown> | undefined;
  if (wrapper === undefined || wrapper === null) return { type: 'none' };
  if (req !== undefined && req !== null) return { type: 'none' };
  const user = wrapper.user as PublicUser | undefined;
  const authError = wrapper.authError as AppError | undefined;
  const had = wrapper.hadToken;
  if (typeof had !== 'boolean' || !had) return { type: 'none' };
  if (user !== undefined) return { type: 'user', user };
  if (authError !== undefined) return { type: 'error', authError };
  return { type: 'none' };
};

export const buildAuthContext = async (
  ctx?: ExpressContext | Record<string, unknown>
): Promise<AuthContext> => {
  const carried = unwrapContextCarrier(ctx);
  if (carried.type === 'user') {
    return { user: carried.user, hadToken: true };
  }
  if (carried.type === 'error') {
    return { hadToken: true, authError: carried.authError };
  }
  const token = extractTokenFromContext(ctx);
  if (token === null) {
    return {};
  }
  try {
    const user = await resolveAuthenticatedUserFromToken(token);
    return { user, hadToken: true };
  } catch (error) {
    const authError: AppError =
      error instanceof AppError
        ? error
        : new UnauthorizedError('Invalid authentication token');
    return { hadToken: true, authError };
  }
};

export const requireAuthenticatedUser = (
  user: PublicUser | undefined
): PublicUser => {
  if (user === undefined) {
    throw new UnauthorizedError('Authentication required');
  }
  return user;
};
