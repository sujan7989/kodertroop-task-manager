import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.statusCode,
    });
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    code: 500,
  });
};

export const notFoundHandler = (_req: Request, res: Response): Response => {
  return res.status(404).json({
    success: false,
    message: 'Route not found',
    code: 404,
  });
};
