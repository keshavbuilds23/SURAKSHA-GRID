import { validateEnv } from './config/env.js';
import { createDatabaseConnection, closeDatabase } from './database/connection.js';
import { initializeSchema } from './database/schema.js';
import { createApp } from './app.js';
import { Server } from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

function startServer(): Server {
  try {
    // 1. Validate environment configuration on startup
    console.log('[SURAKSHA-GRID BACKEND] Validating environment configuration...');
    const config = validateEnv();

    // 2. Establish SQLite database connection
    console.log(`[SURAKSHA-GRID BACKEND] Connecting to SQLite database (${config.DB_PATH})...`);
    const db = createDatabaseConnection({ dbPath: config.DB_PATH });

    // 3. Apply versioned schema migrations safely
    console.log('[SURAKSHA-GRID BACKEND] Initializing database schema...');
    const migrationResult = initializeSchema(db);
    console.log(
      `[SURAKSHA-GRID BACKEND] Schema initialized. Applied: ${migrationResult.appliedCount}, Current Version: ${migrationResult.currentVersion}`
    );

    // 4. Initialize Express Application
    const app = createApp({ db, config });

    // 5. Start HTTP Listener
    const server = app.listen(config.PORT, () => {
      console.log('================================================================');
      console.log(`  SURAKSHA GRID — Disaster Coordination REST API (:v1)`);
      console.log(`  Environment : ${config.NODE_ENV}`);
      console.log(`  API Root    : http://localhost:${config.PORT}${config.API_PREFIX}`);
      console.log(`  Health Check: http://localhost:${config.PORT}${config.API_PREFIX}/health`);
      console.log(`  CORS Origin : ${config.CORS_ORIGIN}`);
      console.log('================================================================');
    });

    // 6. Graceful shutdown handler
    const handleShutdown = (signal: string) => {
      console.log(`\n[SURAKSHA-GRID BACKEND] Received ${signal}. Closing HTTP server gracefully...`);
      server.close(() => {
        console.log('[SURAKSHA-GRID BACKEND] HTTP server closed. Closing SQLite database connection...');
        closeDatabase(db);
        console.log('[SURAKSHA-GRID BACKEND] Database connection closed cleanly. Exit.');
        process.exit(0);
      });

      // Force shutdown if connections do not close in 5 seconds
      setTimeout(() => {
        console.error('[SURAKSHA-GRID BACKEND] Forced shutdown due to timeout.');
        process.exit(1);
      }, 5000);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    return server;
  } catch (err) {
    console.error('[SURAKSHA-GRID BACKEND] Fatal startup error:', err);
    process.exit(1);
  }
}

// Start if executed directly
const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isDirectExecution) {
  startServer();
}

export { startServer };
