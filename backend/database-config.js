/**
 * Database Configuration - SQLite
 *
 * Uses better-sqlite3 for fast, synchronous SQLite operations
 * All write operations are serialized through a write queue to prevent lock contention
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const dbQueue = require('./utils/db-write-queue');

// Database file path
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'subsapp_v2.db');

// Create database directory if it doesn't exist
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database connection
const db = new Database(DB_PATH, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : null
});

// Enable foreign keys (important!)
db.pragma('foreign_keys = ON');

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Set busy timeout - wait up to 5 seconds for locks to clear
// This prevents SQLITE_BUSY errors when multiple processes write simultaneously
db.pragma('busy_timeout = 5000');

/**
 * Query function - converts synchronous SQLite to promise-based API
 * to match the MySQL2 interface used throughout the app
 * Write operations are serialized through a queue to prevent lock contention
 */
async function query(sql, params = []) {
    const trimmedSql = sql.trim().toUpperCase();
    const isReadQuery = trimmedSql.startsWith('SELECT') ||
                        trimmedSql.startsWith('SHOW') ||
                        trimmedSql.startsWith('PRAGMA');

    if (isReadQuery) {
        // Read operations - execute directly (SQLite handles concurrent reads fine)
        try {
            const stmt = db.prepare(sql);
            const rows = stmt.all(...params);
            return rows;
        } catch (error) {
            console.error('[DB] Read query failed:', error.message);
            throw error;
        }
    } else {
        // Write operations - serialize through queue to prevent lock contention
        return dbQueue.write(() => {
            const stmt = db.prepare(sql);
            const result = stmt.run(...params);
            // Return MySQL-compatible result
            return {
                insertId: result.lastInsertRowid,
                affectedRows: result.changes
            };
        });
    }
}

/**
 * Get connection (for transaction support)
 * Note: SQLite doesn't need explicit connections, but we provide this
 * for API compatibility with MySQL code
 *
 * All operations go through the write queue to prevent SQLITE_BUSY errors
 */
async function getConnection() {
    let inTransaction = false;

    // Return a connection-like object with transaction support
    return {
        // Begin transaction - goes through queue to ensure exclusive access
        beginTransaction: async () => {
            return dbQueue.write(() => {
                try {
                    db.prepare('BEGIN IMMEDIATE').run();
                    inTransaction = true;
                } catch (error) {
                    // Transaction may already be active
                    if (!error.message.includes('within a transaction')) {
                        throw error;
                    }
                    inTransaction = true;
                }
            });
        },

        // Execute query - all operations go through queue
        execute: async (sql, params = []) => {
            const trimmedSql = sql.trim().toUpperCase();
            const isReadQuery = trimmedSql.startsWith('SELECT') ||
                               trimmedSql.startsWith('SHOW') ||
                               trimmedSql.startsWith('PRAGMA');

            if (isReadQuery) {
                // Reads can execute directly (SQLite handles concurrent reads)
                const stmt = db.prepare(sql);
                const rows = stmt.all(...params);
                return [rows, null];
            } else {
                // Writes go through the queue
                return dbQueue.write(() => {
                    const stmt = db.prepare(sql);
                    const result = stmt.run(...params);
                    return [{
                        insertId: result.lastInsertRowid,
                        affectedRows: result.changes
                    }, null];
                });
            }
        },

        // Commit transaction - goes through queue
        commit: async () => {
            if (inTransaction) {
                return dbQueue.write(() => {
                    try {
                        db.prepare('COMMIT').run();
                    } catch (error) {
                        // Ignore if no transaction is active
                        if (!error.message.includes('no transaction')) {
                            throw error;
                        }
                    }
                    inTransaction = false;
                });
            }
        },

        // Rollback transaction - goes through queue
        rollback: async () => {
            if (inTransaction) {
                return dbQueue.write(() => {
                    try {
                        db.prepare('ROLLBACK').run();
                    } catch (error) {
                        // Ignore if no transaction is active (may have auto-rolled back on error)
                        if (!error.message.includes('no transaction')) {
                            throw error;
                        }
                    }
                    inTransaction = false;
                });
            }
        },

        // Release (no-op for SQLite)
        release: () => {
            // SQLite doesn't need to release connections
            // But ensure we're not leaving a transaction open
            if (inTransaction) {
                // Queue the rollback to avoid conflicts
                dbQueue.write(() => {
                    try {
                        db.prepare('ROLLBACK').run();
                    } catch (e) {
                        // Ignore
                    }
                }).catch(() => {});
                inTransaction = false;
            }
        }
    };
}

/**
 * Test database connection
 */
async function testConnection() {
    try {
        const result = await query('SELECT 1 as test');
        return result.length > 0;
    } catch (error) {
        console.error('Database connection test failed:', error);
        return false;
    }
}

/**
 * Close database (for cleanup)
 */
function close() {
    db.close();
}

/**
 * Get database path
 */
function getDbPath() {
    return DB_PATH;
}

module.exports = {
    db,          // Raw database object for direct use if needed
    query,       // Promise-based query function
    getConnection, // Get connection for transactions
    testConnection,
    close,
    getDbPath
};
