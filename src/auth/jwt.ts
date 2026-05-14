/**
 * JWT Utilities
 * Geração e validação de tokens JWT
 */

import jwt from 'jsonwebtoken';
import type { JWTPayload } from './types';

const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret || _jwtSecret.trim().length < 32) {
  const msg =
    !_jwtSecret || _jwtSecret.trim() === ''
      ? '[JWT] FATAL: JWT_SECRET não definida. Gere com: openssl rand -base64 48'
      : `[JWT] FATAL: JWT_SECRET muito curta (${_jwtSecret.length} chars, mínimo 32). Use: openssl rand -base64 48`;
  // Em produção, abortar; em dev, apenas alertar
  if (process.env.NODE_ENV === 'production') {
    throw new Error(msg);
  } else {
    console.warn(msg);
  }
}
const JWT_SECRET: jwt.Secret = (_jwtSecret ?? 'dev-only-insecure-secret-do-not-use-in-production').trim();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Gera um token JWT para um usuário
 */
export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  const tokenPayload = {
    userId: payload.userId,
    tenantId: payload.tenantId,
    email: payload.email,
    role: payload.role,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
}

/**
 * Valida e decodifica um token JWT
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Extrai token do header Authorization
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

