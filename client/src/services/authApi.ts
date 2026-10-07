import { GRAPHQL_URL, STORAGE_KEYS } from '../utils/constants';
import type {
  AuthPayload,
  AuthUser,
  RegisterInput,
  LoginInput,
  AuthError,
} from '../types/auth';

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: { code?: string };
  }>;
}

const parseGqlErrors = (
  errors?: Array<{ message: string; extensions?: { code?: string } }>
): AuthError => {
  const first = errors?.[0];
  return {
    message: first?.message ?? 'Request failed',
    code: (first?.extensions?.code as AuthError['code']) ?? undefined,
  };
};

const postGraphql = async <T>(
  query: string,
  variables: Record<string, unknown>,
  token?: string
): Promise<T> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok && response.status >= 500) {
    throw new Error('Server error');
  }

  const json = (await response.json()) as GqlResponse<T>;

  if (json.errors && json.errors.length > 0) {
    throw parseGqlErrors(json.errors);
  }

  if (!json.data) {
    throw { message: 'Empty response' } as AuthError;
  }

  return json.data;
};

export const register = async (input: RegisterInput): Promise<AuthPayload> => {
  return postGraphql<{ register: AuthPayload }>(
    'mutation Register($input: RegisterInput!) { register(input: $input) { token user { id name email createdAt updatedAt } } }',
    { input }
  ).then((d) => d.register);
};

export const login = async (input: LoginInput): Promise<AuthPayload> => {
  return postGraphql<{ login: AuthPayload }>(
    'mutation Login($input: LoginInput!) { login(input: $input) { token user { id name email createdAt updatedAt } } }',
    { input }
  ).then((d) => d.login);
};

export const fetchMe = async (token?: string): Promise<AuthUser | null> => {
  const authToken = token ?? localStorage.getItem(STORAGE_KEYS.TOKEN) ?? undefined;
  return postGraphql<{ me: AuthUser | null }>(
    'query Me { me { id name email createdAt updatedAt } }',
    {},
    authToken
  ).then((d) => d.me);
};
