import databaseService from '../services/databaseService.js';
import { logError } from '../middleware/logger.js';

async function runMigration() {
  try {
    await databaseService.initialize();
    console.log('Database initialized and migrations applied');
  } catch (error) {
    logError(error, { context: 'scripts.migrate' });
    console.error('Failed to run migrations:', error.message);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

runMigration();
