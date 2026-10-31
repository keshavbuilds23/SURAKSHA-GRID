import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from '../src/config/env.js';

describe('Environment Configuration Validation (Zod)', () => {
  test('accepts valid configuration and applies sensible defaults', () => {
    const raw = {
      PORT: '5000',
      NODE_ENV: 'development',
      CORS_ORIGIN: 'http://localhost:5173',
      JWT_SECRET: 'super-secret-key-that-is-at-least-16-chars',
    };

    const config = validateEnv(raw);
    assert.equal(config.PORT, 5000);
    assert.equal(config.NODE_ENV, 'development');
    assert.equal(config.API_PREFIX, '/api/v1');
    assert.equal(config.CORS_ORIGIN, 'http://localhost:5173');
    assert.equal(config.RATE_LIMIT_WINDOW_MS, 60000);
    assert.equal(config.RATE_LIMIT_MAX_REQUESTS, 100);
  });

  test('rejects privileged port numbers (< 1024)', () => {
    assert.throws(
      () => {
        validateEnv({
          PORT: '80',
          JWT_SECRET: 'super-secret-key-that-is-at-least-16-chars',
        });
      },
      /PORT must be an unprivileged port >= 1024/,
      'Should reject privileged port 80'
    );
  });

  test('rejects out-of-range port numbers (> 65535)', () => {
    assert.throws(
      () => {
        validateEnv({
          PORT: '70000',
          JWT_SECRET: 'super-secret-key-that-is-at-least-16-chars',
        });
      },
      /PORT must be <= 65535/,
      'Should reject port > 65535'
    );
  });

  test('rejects unrecognized NODE_ENV values', () => {
    assert.throws(
      () => {
        validateEnv({
          NODE_ENV: 'staging',
          JWT_SECRET: 'super-secret-key-that-is-at-least-16-chars',
        });
      },
      /Invalid enum value/,
      'Should reject invalid NODE_ENV'
    );
  });

  test('rejects API_PREFIX without a leading slash', () => {
    assert.throws(
      () => {
        validateEnv({
          API_PREFIX: 'api/v1',
          JWT_SECRET: 'super-secret-key-that-is-at-least-16-chars',
        });
      },
      /API_PREFIX must start with a slash/,
      'Should reject prefix without leading slash'
    );
  });

  test('strictly enforces >=32 character JWT_SECRET in production mode', () => {
    // 20 characters in production must fail
    assert.throws(
      () => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'only-twenty-chars-long!',
        });
      },
      /JWT_SECRET must be at least 32 characters in production mode/,
      'Production mode must reject secrets with length < 32'
    );

    // 35 characters in production must succeed
    const validProd = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'valid-secure-production-secret-with-high-entropy-123456789',
    });
    assert.equal(validProd.NODE_ENV, 'production');
  });
});

