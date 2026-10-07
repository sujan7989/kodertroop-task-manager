export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthPayload {
  token: string;
  user: AuthUser;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export type AuthErrorCode =
  | 'UNAUTHENTICATED'
  | 'BAD_USER_INPUT'
  | 'CONFLICT'
  | 'INTERNAL_SERVER_ERROR';

export interface AuthError {
  message: string;
  code?: AuthErrorCode;
  fields?: Record<string, string>;
}
