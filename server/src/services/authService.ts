import bcrypt from 'bcryptjs';
import { UserModel, UserDocument } from '../models/User';
import {
  signAccessToken,
  verifyAccessToken,
  JwtVerificationError,
  JwtExpiredError,
  JwtInvalidError,
} from '../utils/jwt';
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  AppError,
} from '../errors/AppError';
import { logger } from '../utils/logger';
import mongoose from 'mongoose';

const BCRYPT_ROUNDS = 12;

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

const toPublicUser = (doc: UserDocument): PublicUser => ({
  id: doc._id.toHexString(),
  name: doc.name,
  email: doc.email,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validatePasswordStrength = (password: string): void => {
  if (password.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters long');
  }
  if (password.length > 128) {
    throw new BadRequestError('Password must be at most 128 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    throw new BadRequestError('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    throw new BadRequestError('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    throw new BadRequestError('Password must contain at least one digit');
  }
};

const hashPassword = async (password: string): Promise<string> =>
  bcrypt.hash(password, BCRYPT_ROUNDS);

const verifyPassword = async (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

export const registerUser = async (input: RegisterInput): Promise<AuthResult> => {
  const name = input.name?.trim() ?? '';
  const email = normalizeEmail(input.email ?? '');
  const password = input.password ?? '';

  if (name.length < 2 || name.length > 80) {
    throw new BadRequestError('Name must be between 2 and 80 characters');
  }
  if (!EMAIL_REGEX.test(email) || email.length > 254) {
    throw new BadRequestError('Please provide a valid email address');
  }
  validatePasswordStrength(password);

  const existing = await UserModel.exists({ email }).lean();
  if (existing !== null) {
    throw new ConflictError('An account with this email already exists');
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch (error) {
    logger.error('Password hashing failed during registration');
    throw new AppError('Registration failed', 500);
  }

  let user: UserDocument;
  try {
    user = await UserModel.create({
      name,
      email,
      passwordHash,
    });
  } catch (error) {
    const errWithCode = error as { code?: number; name?: string };
    if (errWithCode.code === 11000) {
      throw new ConflictError('An account with this email already exists');
    }
    if (error instanceof mongoose.Error.ValidationError) {
      const messages = Object.values(error.errors).map((e) => e.message);
      throw new BadRequestError(messages.join('. '));
    }
    logger.error('User creation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AppError('Registration failed', 500);
  }

  const token = signAccessToken(user._id.toHexString());
  return { token, user: toPublicUser(user) };
};

export const loginUser = async (input: LoginInput): Promise<AuthResult> => {
  const email = normalizeEmail(input.email ?? '');
  const password = input.password ?? '';

  const GENERIC_AUTH_ERROR = 'Invalid email or password';

  if (!email || !password) {
    throw new UnauthorizedError(GENERIC_AUTH_ERROR);
  }

  let userDoc: UserDocument | null;
  try {
    userDoc = await UserModel.findOne({ email }).select('+passwordHash');
  } catch (error) {
    logger.error('User lookup failed during login', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AppError('Authentication failed', 500);
  }

  if (userDoc === null) {
    try {
      await bcrypt.compare(password, '$2a$12$'.padEnd(60, 'A'));
    } catch {
      // no-op — constant-time dummy compare
    }
    throw new UnauthorizedError(GENERIC_AUTH_ERROR);
  }

  const passwordHash: string = userDoc.get('passwordHash');

  let passwordMatches: boolean;
  try {
    passwordMatches = await verifyPassword(password, passwordHash);
  } catch (error) {
    logger.error('Password verification failed during login');
    throw new AppError('Authentication failed', 500);
  }

  if (!passwordMatches) {
    throw new UnauthorizedError(GENERIC_AUTH_ERROR);
  }

  const token = signAccessToken(userDoc._id.toHexString());
  return { token, user: toPublicUser(userDoc) };
};

export const getUserById = async (userId: string): Promise<PublicUser | null> => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }
  const user = await UserModel.findById(userId).lean();
  if (!user) return null;
  return {
    id: user._id.toHexString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

export const resolveAuthenticatedUserFromToken = async (
  token: string
): Promise<PublicUser> => {
  let verified;
  try {
    verified = verifyAccessToken(token);
  } catch (error) {
    if (error instanceof JwtExpiredError) {
      throw new UnauthorizedError('Token has expired');
    }
    if (error instanceof JwtInvalidError || error instanceof JwtVerificationError) {
      throw new UnauthorizedError('Invalid authentication token');
    }
    logger.error('JWT verification error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AppError('Authentication failed', 500);
  }
  const user = await getUserById(verified.payload.sub);
  if (!user) {
    throw new UnauthorizedError('Invalid authentication token');
  }
  return user;
};
