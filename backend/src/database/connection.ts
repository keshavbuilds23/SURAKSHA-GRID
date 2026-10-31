import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getResolvedDbPath } from '../config/env.js';

export interface DatabaseConnectionOptions {
  dbPath?: string;
  readonly?: boolean;
  verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
}

/**
 * Creates and configures a SQLite connection with production resilience pragmas.
 */
export function createDatabaseConnection(options: DatabaseConnectionOptions = {}): Database.Database {
  const targetPath = options.dbPath ? options.dbPath : getResolvedDbPath();

  try {
    // If saving to file on disk, ensure directory exists
    if (targetPath !== ':memory:') {
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
    }

    const db = new Database(targetPath, {
      readonly: options.readonly ?? false,
      verbose: options.verbose,
    });

    // 1. Enforce Foreign Keys
    db.pragma('foreign_keys = ON');

    // 2. Set Busy Timeout to 5000ms to eliminate SQLITE_BUSY under concurrency
    db.pragma('busy_timeout = 5000');

    // 3. Set Write-Ahead Logging (WAL) mode for disk databases
    if (targetPath !== ':memory:') {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
    }

    return db;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize SQLite database at "${targetPath}": ${message}`);
  }
}

/**
 * Verifies database health and connectivity via simple parameterized query.
 */
export function checkDatabaseHealth(db: Database.Database): {
  connected: boolean;
  journalMode?: string;
  error?: string;
} {
  try {
    const row = db.prepare('SELECT 1 as healthy').get() as { healthy: number } | undefined;
    if (row && row.healthy === 1) {
      const journalMode = db.pragma('journal_mode', { simple: true }) as string;
      return {
        connected: true,
        journalMode,
      };
    }
    return {
      connected: false,
      error: 'Health check query returned unexpected result',
    };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Safely closes the database connection.
 */
export function closeDatabase(db: Database.Database): void {
  try {
    if (db && db.open) {
      db.close();
    }
  } catch (err) {
    console.error('Error closing database connection:', err);
  }
}

