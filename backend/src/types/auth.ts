/**
 * SURAKSHA GRID — Authentication Type Definitions
 */

export interface AuthUserResponse {
  id: number;
  username: string;
  role: string;
  full_name: string;
  phone?: string | null;
}

export interface LoginResponseData {
  token: string;
  user: AuthUserResponse;
  expires_in: string;
}

