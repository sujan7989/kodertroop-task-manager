import { GraphQLError } from 'graphql';
import {
  AppError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnavailableError,
} from '../errors/AppError';
import { logger } from '../utils/logger';
import { config } from '../config';

type MaybeAppError =
  | AppError
  | (Record<string, unknown> & { graphqlErrorCode?: unknown; statusCode?: unknown; constructor?: { name?: string } });

const extractGqlCode = (obj: unknown): string | undefined => {
  if (obj === null || obj === undefined) return undefined;
  const explicit = (obj as { graphqlErrorCode?: unknown }).graphqlErrorCode;
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  return undefined;
};

export const findAppError = (formatted: GraphQLError): AppError | undefined => {
  const candidates: Array<unknown> = [];
  candidates.push(formatted.originalError);
  const ext = formatted.extensions as { exception?: unknown } | undefined;
  if (ext !== undefined && ext !== null) candidates.push(ext.exception);
  const fromFormatted = extractGqlCode(formatted);
  if (fromFormatted !== undefined) return formatted as unknown as AppError;
  for (const c of candidates) {
    if (c === null || c === undefined) continue;
    const code = extractGqlCode(c);
    if (code !== undefined) return c as AppError;
    if (c instanceof AppError) return c;
  }
  for (const c of candidates) {
    if (c === null || c === undefined) continue;
    const rec = c as MaybeAppError;
    const sc = typeof (rec as { statusCode?: unknown }).statusCode === 'number';
    const cn = typeof (rec.constructor as { name?: string } | undefined)?.name === 'string'
      ? (rec.constructor as { name: string }).name
      : undefined;
    const knownNames = ['UnauthorizedError','BadRequestError','ValidationError','ConflictError','ForbiddenError','NotFoundError','UnavailableError','AppError'];
    if (sc && cn !== undefined && knownNames.includes(cn)) return c as AppError;
  }
  return undefined;
};

export const classifyErrorCode = (appError: AppError): string => {
  const explicit = extractGqlCode(appError);
  if (explicit !== undefined) return explicit;
  if (appError instanceof UnauthorizedError) return 'UNAUTHENTICATED';
  if (appError instanceof ValidationError || appError instanceof BadRequestError) return 'BAD_USER_INPUT';
  if (appError instanceof ConflictError) return 'CONFLICT';
  if (appError instanceof ForbiddenError) return 'FORBIDDEN';
  if (appError instanceof NotFoundError) return 'NOT_FOUND';
  if (appError instanceof UnavailableError) return 'SERVICE_UNAVAILABLE';
  const cn = (appError.constructor as { name?: string } | undefined)?.name;
  if (cn === 'UnauthorizedError') return 'UNAUTHENTICATED';
  if (cn === 'ValidationError' || cn === 'BadRequestError') return 'BAD_USER_INPUT';
  if (cn === 'ConflictError') return 'CONFLICT';
  if (cn === 'ForbiddenError') return 'FORBIDDEN';
  if (cn === 'NotFoundError') return 'NOT_FOUND';
  if (cn === 'UnavailableError') return 'SERVICE_UNAVAILABLE';
  return 'INTERNAL_SERVER_ERROR';
};

const isSafeMessageError = (appError: AppError): boolean => {
  const safeSet: ReadonlyArray<string> = [
    'UNAUTHENTICATED',
    'BAD_USER_INPUT',
    'CONFLICT',
    'FORBIDDEN',
    'NOT_FOUND',
    'SERVICE_UNAVAILABLE',
  ];
  const code = classifyErrorCode(appError);
  return safeSet.includes(code);
};

export const formatApolloError = (formattedError: GraphQLError) => {
  const appError = findAppError(formattedError);
  const extensions = formattedError.extensions ?? {};

  let code: string | undefined;
  if (appError !== undefined) {
    code = classifyErrorCode(appError);
  } else if (formattedError.originalError !== undefined) {
    code = 'INTERNAL_SERVER_ERROR';
  }

  const extensionsWithCode =
    code !== undefined
      ? { ...extensions, code }
      : extensions;

  logger.error('GraphQL error', {
    message: formattedError.message,
    code,
    locations: formattedError.locations,
    path: formattedError.path,
  });

  if (config.server.isProduction) {
    const safeMessage =
      appError !== undefined && isSafeMessageError(appError)
        ? formattedError.message
        : appError === undefined && formattedError.originalError === undefined
          ? formattedError.message
          : 'Internal server error';
    return {
      ...formattedError,
      message: safeMessage,
      extensions: extensionsWithCode,
    };
  }

  return {
    ...formattedError,
    extensions: extensionsWithCode,
  };
};
