export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
export const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL ?? 'http://localhost:4000/graphql';

export const STORAGE_KEYS = {
  TOKEN: 'kodertroop_token',
  USER: 'kodertroop_user',
} as const;
