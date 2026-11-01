/**
 * SURAKSHA GRID — Frontend Authentication Types
 */

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  full_name: string;
  phone?: string | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  expires_in: string;
}

