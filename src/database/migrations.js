import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './connection.js';
import { logInfo, logError } from '../middleware/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MigrationManager {
  constructor() {
    this.migrationTableCreated = false;
  }

  async ensureMigrationTable() {
    if (this.migrationTableCreated) return;

    try {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS migrations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          checksum VARCHAR(64) NOT NULL
        )
      `;
      
      await db.query(createTableSQL);
      this.migrationTableCreated = true;
      logInfo('Migration table ensured');
    } catch (error) {
      logError(error, { context: 'migration.ensureTable' });
      throw error;
    }
  }

  async getMigrationChecksum(content) {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async isReady() {
    return db.isAvailable();
  }

  async runMigrations() {
    try {
      if (!db.isAvailable()) {
        logInfo('Database not available, skipping migrations');
        return;
      }

      await this.ensureMigrationTable();
      
      // Read schema.sql file
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schemaContent = await fs.readFile(schemaPath, 'utf8');
      const checksum = await this.getMigrationChecksum(schemaContent);
      
      // Check if this migration has already been run
      const existingMigrations = await db.query(
        'SELECT * FROM migrations WHERE name = ?',
        ['initial_schema']
      );

      if (existingMigrations.length > 0) {
        const existing = existingMigrations[0];
        if (existing.checksum === checksum) {
          logInfo('Initial schema migration already applied and up to date');
          return;
        } else {
          logInfo('Initial schema has changed, updating...');
          // Remove old migration record so we can re-run
          await db.query('DELETE FROM migrations WHERE name = ?', ['initial_schema']);
        }
      }

      logInfo('Running initial schema migration');
      
      // Split the schema into individual statements
      const statements = schemaContent
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt && !stmt.startsWith('--'));

      // Execute each statement
      for (const statement of statements) {
        if (statement) {
          try {
            await db.query(statement);
          } catch (error) {
            // Ignore table already exists errors and similar
            if (!error.message.includes('already exists') && 
                !error.message.includes('Duplicate entry')) {
              throw error;
            }
          }
        }
      }

      // Record the migration
      await db.query(
        'INSERT INTO migrations (name, checksum) VALUES (?, ?)',
        ['initial_schema', checksum]
      );

      logInfo('Initial schema migration completed successfully');

    } catch (error) {
      logError(error, { context: 'migration.run' });
      throw error;
    }
  }

  async rollback(migrationName) {
    try {
      logInfo('Rolling back migration', { migration: migrationName });
      
      // For now, we don't have rollback scripts
      // In a full implementation, you'd have down migrations
      throw new Error('Migration rollbacks not implemented yet');
      
    } catch (error) {
      logError(error, { context: 'migration.rollback', migration: migrationName });
      throw error;
    }
  }

  async getAppliedMigrations() {
    try {
      if (!db.isAvailable()) {
        return [];
      }

      await this.ensureMigrationTable();
      
      const migrations = await db.query(
        'SELECT * FROM migrations ORDER BY executed_at DESC'
      );

      return migrations;
    } catch (error) {
      logError(error, { context: 'migration.getApplied' });
      return [];
    }
  }

  async getMigrationStatus() {
    try {
      const applied = await this.getAppliedMigrations();
      
      return {
        available: db.isAvailable(),
        appliedCount: applied.length,
        applied: applied.map(m => ({
          name: m.name,
          executedAt: m.executed_at,
          checksum: m.checksum
        }))
      };
    } catch (error) {
      logError(error, { context: 'migration.getStatus' });
      return {
        available: false,
        appliedCount: 0,
        applied: [],
        error: error.message
      };
    }
  }
}

export default new MigrationManager();