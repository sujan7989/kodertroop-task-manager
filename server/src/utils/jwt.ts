import jwt, { JwtPayload, TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { config } from '../config';

export interface AccessTokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

export interface VerifiedToken {
  payload: AccessTokenPayload;
}

export class JwtVerificationError extends Error {}
export class JwtExpiredError extends JwtVerificationError {}
export class JwtInvalidError extends JwtVerificationError {}

export const signAccessToken = (userId: string): string => {
  const secret: jwt.Secret = config.jwt.secret;
  return jwt.sign(
    { sub: userId },
    secret,
    { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
  );
};

export const verifyAccessToken = (token: string): VerifiedToken => {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    if (typeof decoded.sub !== 'string') {
      throw new JwtInvalidError('Token missing subject claim');
    }
    if (typeof decoded.iat !== 'number' || typeof decoded.exp !== 'number') {
      throw new JwtInvalidError('Token missing iat/exp claims');
    }
    return {
      payload: {
        sub: decoded.sub,
        iat: decoded.iat,
        exp: decoded.exp,
      },
    };
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw new JwtExpiredError('Token has expired');
    }
    if (error instanceof JsonWebTokenError) {
      throw new JwtInvalidError(`Invalid token: ${error.message}`);
    }
    throw new JwtInvalidError('Token verification failed');
  }
};
