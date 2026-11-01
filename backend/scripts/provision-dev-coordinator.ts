import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validateEnv } from '../src/config/env.js';
import { createDatabaseConnection, closeDatabase } from '../src/database/connection.js';
import { initializeSchema } from '../src/database/schema.js';

/**
 * Local Development Coordinator Provisioning Script
 * 
 * Safety & Security Guarantees:
 * 1. Strictly refuses to execute in production mode (NODE_ENV=production).
 * 2. Uses the identical environment configuration and SQLite database as the backend server.
 * 3. Creates the coordinator user 'coord_assam_dev' only if not already present.
 * 4. Generates a genuine bcrypt hash with 10 salt rounds for the password_hash column.
 * 5. Discards the random password immediately; NEVER prints or stores plaintext passwords or JWT_SECRET.
 * 6. If the user already exists, preserves their existing credentials and role without modification.
 * 7. Confirms user presence in SQLite before minting an HS256 Bearer JWT with 1-hour expiry.
 */
function provisionDevCoordinator(): void {
  // 1. Refuse execution in production environment
  if (process.env.NODE_ENV === 'production') {
    console.error('[SECURITY ERROR] Script execution blocked: Cannot provision development coordinator when NODE_ENV=production.');
    process.exit(1);
  }

  // 2. Load and validate server environment configuration
  const config = validateEnv();
  if (config.NODE_ENV === 'production') {
    console.error('[SECURITY ERROR] Script execution blocked: Configured environment is production.');
    process.exit(1);
  }

  // 3. Connect to the active SQLite database
  const db = createDatabaseConnection({ dbPath: config.DB_PATH });

  try {
    // Ensure migrations are initialized so tables exist
    initializeSchema(db);

    const TARGET_USERNAME = 'coord_assam_dev';

    // 4. Check if coordinator account already exists
    let user = db
      .prepare('SELECT id, username, role, full_name FROM users WHERE username = ? COLLATE NOCASE')
      .get(TARGET_USERNAME) as { id: number; username: string; role: string; full_name: string } | undefined;

    if (!user) {
      // 5. Generate a random password and genuine bcrypt hash
      const randomSecret = crypto.randomBytes(24).toString('base64url');
      const saltRounds = 10;
      const passwordHash = bcrypt.hashSync(randomSecret, saltRounds);

      const insertResult = db.prepare(`
        INSERT INTO users (username, password_hash, role, full_name, phone)
        VALUES (?, ?, 'coordinator', ?, ?)
      `).run(
        TARGET_USERNAME,
        passwordHash,
        'Assam State EOC Coordinator (Dev)',
        '+919435012345'
      );

      console.log(`[PROVISION] Created new coordinator account in SQLite:`);
      console.log(`  User ID  : ${insertResult.lastInsertRowid}`);
      console.log(`  Username : ${TARGET_USERNAME}`);
      console.log(`  Role     : coordinator`);
      console.log(`  Full Name: Assam State EOC Coordinator (Dev)`);
      console.log(`[SECURITY] Genuine bcrypt hash stored. Plaintext password discarded.\n`);

      user = db
        .prepare('SELECT id, username, role, full_name FROM users WHERE id = ?')
        .get(insertResult.lastInsertRowid) as { id: number; username: string; role: string; full_name: string };
    } else {
      console.log(`[FOUND] Existing coordinator account in SQLite:`);
      console.log(`  User ID  : ${user.id}`);
      console.log(`  Username : ${user.username}`);
      console.log(`  Role     : ${user.role}`);
      console.log(`  Full Name: ${user.full_name}`);
      console.log(`[POLICY] Existing user credentials and role left unchanged.\n`);

      if (user.role !== 'coordinator' && user.role !== 'admin') {
        console.error(`[ROLE CONFLICT] User '${TARGET_USERNAME}' does not possess coordinator/admin role in database.`);
        process.exit(1);
      }
    }

    // 6. Confirm user existence in SQLite before minting token
    const confirmedUser = db
      .prepare('SELECT id, username, role, full_name FROM users WHERE id = ?')
      .get(user.id) as { id: number; username: string; role: string; full_name: string } | undefined;

    if (!confirmedUser) {
      console.error(`[ERROR] Failed to confirm user ID ${user.id} in SQLite.`);
      process.exit(1);
    }

    // 7. Mint HS256 Bearer JWT with 1-hour expiration
    const token = jwt.sign(
      {
        id: confirmedUser.id,
        sub: confirmedUser.id,
        username: confirmedUser.username,
        role: confirmedUser.role,
        full_name: confirmedUser.full_name,
      },
      config.JWT_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '1h',
      }
    );

    // 8. Output token for local testing (Never print secrets or passwords)
    console.log('================================================================');
    console.log('  LOCAL DEV COORDINATOR BEARER TOKEN (VALID FOR 1 HOUR)');
    console.log('================================================================');
    console.log(token);
    console.log('================================================================\n');
    console.log('Usage Instructions:');
    console.log('  1. In Frontend UI (http://localhost:5173):');
    console.log('     Click "Public Mode (Set Token)" in the NGO Network page.');
    console.log('     Paste this token and click "Apply Credentials".');
    console.log('     Status will change to "Coordinator Key: Active".');
    console.log('\n  2. In HTTP Requests (cURL / PowerShell):');
    console.log('     Add header: Authorization: Bearer <TOKEN>');
    console.log('================================================================\n');
  } finally {
    closeDatabase(db);
  }
}

provisionDevCoordinator();

