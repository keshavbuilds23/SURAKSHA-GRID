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

  test('strictly enforces >=32 character JWT_SECRET in production mode and forbids development default', () => {
    // 1. Missing JWT_SECRET in production must fail
    assert.throws(
      () => {
        validateEnv({
          NODE_ENV: 'production',
        });
      },
      /JWT_SECRET must be explicitly supplied in production mode and cannot use the development default/,
      'Production mode without JWT_SECRET must fail'
    );

    // 2. Known development default secret in production must fail (even though it is 48 chars)
    assert.throws(
      () => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'suraksha-grid-dev-insecure-secret-key-min-32-chars',
        });
      },
      /cannot use the development default/,
      'Production mode with known dev secret must fail'
    );

    // 3. Empty or whitespace JWT_SECRET in production must fail
    assert.throws(
      () => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_SECRET: '   ',
        });
      },
      /JWT_SECRET must be explicitly supplied in production mode/,
      'Production mode with whitespace secret must fail'
    );

    // 4. Short secret (< 32 chars) in production must fail
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

    // 5. Valid unique secret (>= 32 chars) in production must succeed
    const validProd = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'valid-secure-production-secret-with-high-entropy-123456789',
    });
    assert.equal(validProd.NODE_ENV, 'production');
    assert.equal(validProd.JWT_SECRET, 'valid-secure-production-secret-with-high-entropy-123456789');
  });

  test('strictly forbids wildcard (*) CORS_ORIGIN in production mode', () => {
    assert.throws(
      () => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'valid-secure-production-secret-with-high-entropy-123456789',
          CORS_ORIGIN: '*',
        });
      },
      /CORS_ORIGIN cannot contain wildcard \(\*\) in production mode/,
      'Production mode must reject wildcard CORS_ORIGIN'
    );

    assert.throws(
      () => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'valid-secure-production-secret-with-high-entropy-123456789',
          CORS_ORIGIN: 'https://suraksha.assam.gov.in, *',
        });
      },
      /CORS_ORIGIN cannot contain wildcard \(\*\) in production mode/,
      'Production mode must reject wildcard CORS_ORIGIN even in comma-separated list'
    );
  });

  test('enforces environment-specific JWT_EXPIRES_IN defaults and preserves overrides', () => {
    // 1. Development/test defaults to 7 days ('7d') when JWT_EXPIRES_IN is omitted
    const devConfig = validateEnv({
      NODE_ENV: 'development',
    });
    assert.equal(devConfig.JWT_EXPIRES_IN, '7d', 'Development must default JWT_EXPIRES_IN to 7d');

    const defaultModeConfig = validateEnv({});
    assert.equal(defaultModeConfig.JWT_EXPIRES_IN, '7d', 'Omitted NODE_ENV must also default JWT_EXPIRES_IN to 7d');

    // 2. Production must NOT silently inherit 7d; defaults to 12h when omitted
    const prodConfig = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'valid-secure-production-secret-with-high-entropy-123456789',
    });
    assert.equal(prodConfig.JWT_EXPIRES_IN, '12h', 'Production must default to 12h and never silently inherit 7d');
    assert.notEqual(prodConfig.JWT_EXPIRES_IN, '7d', 'Production must not default to 7d');

    // 3. Explicit JWT_EXPIRES_IN environment override is preserved in development
    const devOverride = validateEnv({
      NODE_ENV: 'development',
      JWT_EXPIRES_IN: '48h',
    });
    assert.equal(devOverride.JWT_EXPIRES_IN, '48h', 'Development must honor JWT_EXPIRES_IN override');

    // 4. Explicit JWT_EXPIRES_IN environment override is preserved in production
    const prodOverride = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'valid-secure-production-secret-with-high-entropy-123456789',
      JWT_EXPIRES_IN: '1h',
    });
    assert.equal(prodOverride.JWT_EXPIRES_IN, '1h', 'Production must honor explicit JWT_EXPIRES_IN configuration');
  });
});

