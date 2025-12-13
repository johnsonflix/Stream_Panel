/**
 * Database Configuration - SQLite
 *
 * Uses better-sqlite3 for fast, synchronous SQLite operations
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

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

/**
 * Query function - converts synchronous SQLite to promise-based API
 * to match the MySQL2 interface used throughout the app
 */
async function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        try {
            // Check if it's a SELECT query
            if (sql.trim().toUpperCase().startsWith('SELECT') ||
                sql.trim().toUpperCase().startsWith('SHOW')) {
                const stmt = db.prepare(sql);
                const rows = stmt.all(...params);
                resolve(rows);
            }
            // INSERT/UPDATE/DELETE
            else {
                const stmt = db.prepare(sql);
                const result = stmt.run(...params);
                // Return MySQL-compatible result
                resolve({
                    insertId: result.lastInsertRowid,
                    affectedRows: result.changes
                });
            }
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Get connection (for transaction support)
 * Note: SQLite doesn't need explicit connections, but we provide this
 * for API compatibility with MySQL code
 */
async function getConnection() {
    let inTransaction = false;

    // Return a connection-like object with transaction support
    return {
        // Begin transaction
        beginTransaction: async () => {
            try {
                db.prepare('BEGIN TRANSACTION').run();
                inTransaction = true;
            } catch (error) {
                // Transaction may already be active
                if (!error.message.includes('within a transaction')) {
                    throw error;
                }
                inTransaction = true;
            }
        },

        // Execute query
        execute: async (sql, params = []) => {
            // For execute, return [rows, fields] like mysql2
            if (sql.trim().toUpperCase().startsWith('SELECT') ||
                sql.trim().toUpperCase().startsWith('SHOW')) {
                const stmt = db.prepare(sql);
                const rows = stmt.all(...params);
                return [rows, null];
            } else {
                const stmt = db.prepare(sql);
                const result = stmt.run(...params);
                return [{
                    insertId: result.lastInsertRowid,
                    affectedRows: result.changes
                }, null];
            }
        },

        // Commit transaction
        commit: async () => {
            if (inTransaction) {
                try {
                    db.prepare('COMMIT').run();
                } catch (error) {
                    // Ignore if no transaction is active
                    if (!error.message.includes('no transaction')) {
                        throw error;
                    }
                }
                inTransaction = false;
            }
        },

        // Rollback transaction
        rollback: async () => {
            if (inTransaction) {
                try {
                    db.prepare('ROLLBACK').run();
                } catch (error) {
                    // Ignore if no transaction is active (may have auto-rolled back on error)
                    if (!error.message.includes('no transaction')) {
                        throw error;
                    }
                }
                inTransaction = false;
            }
        },

        // Release (no-op for SQLite)
        release: () => {
            // SQLite doesn't need to release connections
            // But ensure we're not leaving a transaction open
            if (inTransaction) {
                try {
                    db.prepare('ROLLBACK').run();
                } catch (e) {
                    // Ignore
                }
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
