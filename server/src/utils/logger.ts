export const logger = {
  info: (message: string, meta?: Record<string, unknown>): void => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta ?? '');
  },
  warn: (message: string, meta?: Record<string, unknown>): void => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta ?? '');
  },
  error: (message: string, meta?: Record<string, unknown>): void => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, meta ?? '');
  },
  debug: (message: string, meta?: Record<string, unknown>): void => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, meta ?? '');
    }
  },
};
