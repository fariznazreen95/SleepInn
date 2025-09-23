export type Role = 'user' | 'host' | 'admin';
export interface JwtUser { id: number; email: string; role: Role; }
