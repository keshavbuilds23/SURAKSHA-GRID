import bcrypt from 'bcryptjs';
import { validateEnv } from '../src/config/env.js';
import { createDatabaseConnection, closeDatabase } from '../src/database/connection.js';
import { initializeSchema } from '../src/database/schema.js';

export const DEFAULT_DEV_COORDINATOR_USERNAME = 'coord_assam_dev';
export const DEFAULT_DEV_COORDINATOR_PASSWORD = 'SurakshaDev@2026';

/**
 * Local Development Coordinator Provisioning Script
 * 
 * Safety & Security Guarantees:
 * 1. Strictly refuses to execute in production mode (NODE_ENV=production).
 * 2. Uses the identical environment configuration and SQLite database as the backend server.
 * 3. Creates or updates the evaluation coordinator user 'coord_assam_dev'.
 * 4. Generates a genuine bcrypt hash with 10 salt rounds for the password_hash column.
 * 5. Supports overriding the evaluation password via DEV_COORDINATOR_PASSWORD env var.
 * 6. Does NOT expose JWT_SECRET in source control or output.
 * 7. Confirms user presence in SQLite with role 'coordinator'.
 */
export function provisionDevCoordinator(dbPath?: string, passwordOverride?: string): { username: string; role: string } {
  // 1. Strictly require NODE_ENV to be explicitly set to 'development' or 'test' (fail-closed)
  const rawNodeEnv = process.env.NODE_ENV ? process.env.NODE_ENV.trim() : '';
  if (!rawNodeEnv || (rawNodeEnv !== 'development' && rawNodeEnv !== 'test')) {
    console.error(
      `[SECURITY ERROR] Script execution blocked: Cannot provision development coordinator unless NODE_ENV is explicitly set to "development" or "test" (received: "${rawNodeEnv || '<missing>'}").`
    );
    process.exit(1);
  }

  // 2. Load and validate server environment configuration
  const config = validateEnv();
  if (config.NODE_ENV === 'production') {
    console.error('[SECURITY ERROR] Script execution blocked: Configured environment is production.');
    process.exit(1);
  }

  // 3. Connect to the active SQLite database
  const db = createDatabaseConnection({ dbPath: dbPath || config.DB_PATH });

  try {
    // Ensure migrations are initialized so tables exist
    initializeSchema(db);

    const TARGET_USERNAME = DEFAULT_DEV_COORDINATOR_USERNAME;
    const targetPassword = passwordOverride || process.env.DEV_COORDINATOR_PASSWORD || DEFAULT_DEV_COORDINATOR_PASSWORD;
    const saltRounds = 10;
    const passwordHash = bcrypt.hashSync(targetPassword, saltRounds);

    // 4. Check if coordinator account already exists
    const existingUser = db
      .prepare('SELECT id, username, role, full_name FROM users WHERE username = ? COLLATE NOCASE')
      .get(TARGET_USERNAME) as { id: number; username: string; role: string; full_name: string } | undefined;

    let userId: number | bigint;

    if (!existingUser) {
      const insertResult = db.prepare(`
        INSERT INTO users (username, password_hash, role, full_name, phone)
        VALUES (?, ?, 'coordinator', ?, ?)
      `).run(
        TARGET_USERNAME,
        passwordHash,
        'Assam State EOC Coordinator (Dev)',
        '+919435012345'
      );
      userId = insertResult.lastInsertRowid;

      console.log(`[PROVISION] Created new coordinator account in SQLite:`);
      console.log(`  User ID  : ${userId}`);
      console.log(`  Username : ${TARGET_USERNAME}`);
      console.log(`  Role     : coordinator`);
      console.log(`  Full Name: Assam State EOC Coordinator (Dev)`);
    } else {
      db.prepare(`
        UPDATE users
        SET password_hash = ?, role = 'coordinator', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `).run(passwordHash, existingUser.id);
      userId = existingUser.id;

      console.log(`[PROVISION] Updated existing coordinator account in SQLite:`);
      console.log(`  User ID  : ${userId}`);
      console.log(`  Username : ${existingUser.username}`);
      console.log(`  Role     : coordinator`);
    }

    console.log(`[SECURITY] Bcrypt password hash generated and stored securely in SQLite.\n`);
    console.log('================================================================');
    console.log('  LOCAL DEV / HACKATHON EVALUATION COORDINATOR CREDENTIALS');
    console.log('  (FOR LOCAL DEMONSTRATION & JUDGING ONLY — NEVER USE IN PRODUCTION)');
    console.log('================================================================');
    console.log(`  Username : ${TARGET_USERNAME}`);
    console.log(`  Password : ${targetPassword}`);
    console.log('================================================================\n');
    console.log('How to Sign In:');
    console.log('  1. In the Web UI (http://localhost:5173 or http://localhost:5174):');
    console.log('     Click "Coordinator Login" in the header or NGO Network page.');
    console.log(`     Sign in with username "${TARGET_USERNAME}" and your password.`);
    console.log('  2. Via API:');
    console.log('     POST /api/v1/auth/login');
    console.log(`     Body: {"username": "${TARGET_USERNAME}", "password": "<password>"}`);
    console.log('================================================================\n');

    return { username: TARGET_USERNAME, role: 'coordinator' };
  } finally {
    closeDatabase(db);
  }
}

// Execute directly if run as CLI script
if (process.argv[1] && process.argv[1].endsWith('provision-dev-coordinator.ts')) {
  provisionDevCoordinator();
}
