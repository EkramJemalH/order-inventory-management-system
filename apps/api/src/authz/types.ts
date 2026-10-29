import type { UserRole, UserStatus } from "@repo/validation";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  image?: string | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuthContext {
  user: AuthUser | null;
  session: AuthSession | null;
}
