import mysql from 'mysql2/promise';
import config from '../config/index.js';
import { logInfo, logError } from '../middleware/logger.js';

class DatabaseConnection {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      if (!config.databaseUrl) {
        logInfo('No database URL configured, using in-memory storage for development');
        return null;
      }

      const url = new URL(config.databaseUrl);
      
      this.pool = mysql.createPool({
        host: url.hostname,
        port: url.port || 3306,
        user: url.username,
        password: url.password,
        database: url.pathname.substring(1), // Remove leading slash
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        acquireTimeout: 60000,
        timeout: 60000,
        reconnect: true,
        charset: 'utf8mb4',
        timezone: '+00:00', // Store everything in UTC
        dateStrings: false,
        supportBigNumbers: true,
        bigNumberStrings: true
      });

      // Test the connection
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();

      this.isConnected = true;
      logInfo('Database connected successfully', {
        host: url.hostname,
        database: url.pathname.substring(1)
      });

      return this.pool;
    } catch (error) {
      logError(error, { context: 'database.connect' });
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.pool) {
        await this.pool.end();
        this.pool = null;
        this.isConnected = false;
        logInfo('Database disconnected');
      }
    } catch (error) {
      logError(error, { context: 'database.disconnect' });
    }
  }

  async query(sql, params = []) {
    try {
      if (!this.pool) {
        throw new Error('Database not connected');
      }

      const [rows, fields] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      logError(error, { 
        context: 'database.query', 
        sql: sql.substring(0, 100),
        params: params?.length || 0 
      });
      throw error;
    }
  }

  async transaction(callback) {
    const connection = await this.pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const result = await callback(connection);
      
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  isAvailable() {
    return this.isConnected && this.pool !== null;
  }

  // Helper method for pagination
  buildPaginationQuery(baseQuery, { limit = 50, offset = 0, orderBy = 'created_at', orderDirection = 'DESC' }) {
    const validDirections = ['ASC', 'DESC'];
    const direction = validDirections.includes(orderDirection.toUpperCase()) ? orderDirection.toUpperCase() : 'DESC';
    
    const paginatedQuery = `
      ${baseQuery}
      ORDER BY ${orderBy} ${direction}
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;
    
    return paginatedQuery;
  }

  // Helper method for building WHERE clauses
  buildWhereClause(filters = {}) {
    const conditions = [];
    const params = [];

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value) && value.length > 0) {
          conditions.push(`${key} IN (${value.map(() => '?').join(', ')})`);
          params.push(...value);
        } else if (typeof value === 'string' && value.includes('%')) {
          conditions.push(`${key} LIKE ?`);
          params.push(value);
        } else {
          conditions.push(`${key} = ?`);
          params.push(value);
        }
      }
    }

    return {
      whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params
    };
  }
}

// Export singleton instance
export default new DatabaseConnection();