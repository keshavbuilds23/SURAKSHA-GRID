import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { EnvConfig } from '../config/env.js';
import { LoginInput } from '../validators/authValidators.js';
import { LoginResponseData, AuthUserResponse } from '../types/auth.js';
import { AppError } from '../types/index.js';

// Constant dummy hash used for constant-time comparison when username is not found
// Prevents side-channel timing analysis attacks that reveal username existence
const DUMMY_BCRYPT_HASH = '$2a$10$wT5gG6p55ZpX54jX4uYg5e3J8c4Z2n1B0v9A8s7D6f5G4h3J2k1L0';

export function createAuthService(db: Database.Database, config: EnvConfig) {
  /**
   * Authenticates a user with username and password.
   * Employs generic error responses and constant-time password comparison to prevent
   * username enumeration and timing attacks.
   */
  function login(credentials: LoginInput): LoginResponseData {
    const { username, password } = credentials;

    const user = db
      .prepare(`
        SELECT id, username, password_hash, role, full_name, phone
        FROM users
        WHERE username = ? COLLATE NOCASE
      `)
      .get(username) as
      | {
          id: number;
          username: string;
          password_hash: string;
          role: string;
          full_name: string;
          phone: string | null;
        }
      | undefined;

    if (!user) {
      // Execute constant-time bcrypt verification to mitigate username enumeration via timing
      bcrypt.compareSync(password, DUMMY_BCRYPT_HASH);
      throw new AppError('Invalid username or password.', 401, 'INVALID_CREDENTIALS');
    }

    const passwordMatches = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatches) {
      throw new AppError('Invalid username or password.', 401, 'INVALID_CREDENTIALS');
    }

    const expiresIn = config.JWT_EXPIRES_IN || '12h';

    const token = jwt.sign(
      {
        id: user.id,
        sub: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
      },
      config.JWT_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: expiresIn as any,
      }
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        phone: user.phone || null,
      },
      expires_in: expiresIn,
    };
  }

  /**
   * Resolves currently authenticated user by ID.
   */
  function getCurrentUser(userId: number): AuthUserResponse {
    const user = db
      .prepare(`
        SELECT id, username, role, full_name, phone
        FROM users
        WHERE id = ?
      `)
      .get(userId) as
      | {
          id: number;
          username: string;
          role: string;
          full_name: string;
          phone: string | null;
        }
      | undefined;

    if (!user) {
      throw new AppError('User profile not found.', 404, 'NOT_FOUND');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      phone: user.phone || null,
    };
  }

  return {
    login,
    getCurrentUser,
  };
}

