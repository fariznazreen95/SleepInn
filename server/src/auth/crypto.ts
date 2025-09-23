// server/src/auth/crypto.ts
import bcrypt from 'bcryptjs';
import jwt, {
  type Secret,
  type SignOptions,
  type JwtPayload,
} from 'jsonwebtoken';

// Make the types explicit so TS picks the correct overloads.
const JWT_SECRET: Secret = (process.env.JWT_SECRET ?? 'dev-secret-change-me');
type Expires = NonNullable<SignOptions['expiresIn']>;
const JWT_EXPIRES: Expires = (process.env.JWT_EXPIRES as Expires) ?? '7d';

type TokenPayload = {
  id: number;
  role: string;
  email: string;
};

export async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: TokenPayload): string {
  // `opts` is explicitly SignOptions and `expiresIn` is NonNullable (no undefined).
  const opts: SignOptions = { expiresIn: JWT_EXPIRES };
  // Coerce payload to JwtPayload to satisfy v9’s narrowed overloads.
  return jwt.sign(payload as unknown as JwtPayload, JWT_SECRET, opts);
}

export function verifyToken(token: string): TokenPayload & JwtPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload & JwtPayload;
}
