/**
 * Database Configuration - PostgreSQL
 *
 * Uses pg (node-postgres) for PostgreSQL connections with connection pooling
 * No write queue needed - PostgreSQL handles concurrent writes natively
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// PostgreSQL connection configuration
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'streampanel',
    user: process.env.DB_USER || 'streampanel',
    password: process.env.DB_PASSWORD || 'streampanel_secure_password',
    max: 20,                          // Maximum number of connections in pool
    idleTimeoutMillis: 30000,         // Close idle connections after 30 seconds
    connectionTimeoutMillis: 5000,    // Error if connection takes longer than 5 seconds
});

// Log pool errors
pool.on('error', (err) => {
    console.error('[DB Pool] Unexpected error on idle client', err);
});

/**
 * Convert SQLite-style ? placeholders to PostgreSQL $1, $2, etc.
 * Also handles some SQL syntax differences
 */
function convertQuery(sql) {
    let paramIndex = 0;
    let convertedSql = sql;

    // Replace ? placeholders with $1, $2, etc.
    convertedSql = convertedSql.replace(/\?/g, () => {
        paramIndex++;
        return `$${paramIndex}`;
    });

    // Convert SQLite datetime functions to PostgreSQL
    // datetime('now') -> NOW()
    convertedSql = convertedSql.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'NOW()');

    // datetime('now', '+X days') -> NOW() + INTERVAL 'X days'
    convertedSql = convertedSql.replace(/datetime\s*\(\s*'now'\s*,\s*'([+-]?\d+)\s+days?'\s*\)/gi, (match, days) => {
        const num = parseInt(days);
        if (num >= 0) {
            return `NOW() + INTERVAL '${num} days'`;
        } else {
            return `NOW() - INTERVAL '${Math.abs(num)} days'`;
        }
    });

    // datetime(column) -> column (PostgreSQL timestamps don't need conversion)
    convertedSql = convertedSql.replace(/datetime\s*\(\s*([^)]+)\s*\)/gi, '$1');

    // Convert boolean comparisons for INTEGER columns
    // Some columns use INTEGER (0/1) but queries may use TRUE/FALSE
    convertedSql = convertedSql.replace(/=\s*TRUE\b/gi, '= 1');
    convertedSql = convertedSql.replace(/=\s*FALSE\b/gi, '= 0');
    convertedSql = convertedSql.replace(/!=\s*TRUE\b/gi, '!= 1');
    convertedSql = convertedSql.replace(/!=\s*FALSE\b/gi, '!= 0');
    convertedSql = convertedSql.replace(/<>\s*TRUE\b/gi, '<> 1');
    convertedSql = convertedSql.replace(/<>\s*FALSE\b/gi, '<> 0');

    // Convert AUTOINCREMENT to SERIAL for PostgreSQL
    // "id INTEGER PRIMARY KEY AUTOINCREMENT" -> "id SERIAL PRIMARY KEY"
    convertedSql = convertedSql.replace(/(\w+)\s+INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, '$1 SERIAL PRIMARY KEY');

    // Convert INSERT OR REPLACE to INSERT ... ON CONFLICT DO UPDATE
    // This is a simple conversion - complex cases may need manual handling
    const insertOrReplaceMatch = convertedSql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertOrReplaceMatch) {
        const tableName = insertOrReplaceMatch[1];
        const columns = insertOrReplaceMatch[2];
        const values = insertOrReplaceMatch[3];
        const columnList = columns.split(',').map(c => c.trim());
        const firstColumn = columnList[0];

        // Build UPDATE SET clause
        const updateClauses = columnList.slice(1).map(col => `${col} = EXCLUDED.${col}`).join(', ');

        convertedSql = `INSERT INTO ${tableName} (${columns}) VALUES (${values}) ON CONFLICT (${firstColumn}) DO UPDATE SET ${updateClauses}`;
    }

    // Convert INSERT OR IGNORE to INSERT ... ON CONFLICT DO NOTHING
    convertedSql = convertedSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    if (sql.toUpperCase().includes('INSERT OR IGNORE')) {
        // Add ON CONFLICT DO NOTHING at the end if not already handled
        if (!convertedSql.toUpperCase().includes('ON CONFLICT')) {
            convertedSql = convertedSql.replace(/VALUES\s*\(([^)]+)\)/i, (match) => {
                return match + ' ON CONFLICT DO NOTHING';
            });
        }
    }

    // Convert REPLACE INTO to INSERT ... ON CONFLICT DO UPDATE
    const replaceMatch = convertedSql.match(/^REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (replaceMatch) {
        const tableName = replaceMatch[1];
        const columns = replaceMatch[2];
        const values = replaceMatch[3];
        const columnList = columns.split(',').map(c => c.trim());
        const firstColumn = columnList[0];

        const updateClauses = columnList.slice(1).map(col => `${col} = EXCLUDED.${col}`).join(', ');

        convertedSql = `INSERT INTO ${tableName} (${columns}) VALUES (${values}) ON CONFLICT (${firstColumn}) DO UPDATE SET ${updateClauses}`;
    }

    return convertedSql;
}

/**
 * Check if query is a write operation
 */
function isWriteQuery(sql) {
    const trimmedSql = sql.trim().toUpperCase();
    return !trimmedSql.startsWith('SELECT') &&
           !trimmedSql.startsWith('SHOW') &&
           !trimmedSql.startsWith('PRAGMA');
}

/**
 * Check if query is an INSERT
 */
function isInsertQuery(sql) {
    return sql.trim().toUpperCase().startsWith('INSERT');
}

/**
 * Add RETURNING id to INSERT queries if not already present
 * Skip for ON CONFLICT queries (UPSERT) and junction tables without id columns
 */
function addReturningId(sql) {
    const upperSql = sql.trim().toUpperCase();

    // Junction tables that don't have an 'id' column (use composite primary keys)
    const tablesWithoutId = [
        'TAG_PLEX_SERVERS',
        'TAG_IPTV_PANELS',
        'USER_TAGS',
        'DASHBOARD_CACHED_STATS',
        'IPTV_EDITOR_SETTINGS'
    ];

    // Check if this is an INSERT into a table without id
    const isJunctionTable = tablesWithoutId.some(table => upperSql.includes(`INTO ${table}`));

    // Only add RETURNING id for simple INSERTs, not for UPSERT or junction tables
    if (upperSql.startsWith('INSERT') &&
        !upperSql.includes('RETURNING') &&
        !upperSql.includes('ON CONFLICT') &&
        !isJunctionTable) {
        // Remove trailing semicolon if present
        let modifiedSql = sql.trim();
        if (modifiedSql.endsWith(';')) {
            modifiedSql = modifiedSql.slice(0, -1);
        }
        return modifiedSql + ' RETURNING id';
    }
    return sql;
}

/**
 * Query function - matches the SQLite interface
 * @param {string} sql - SQL query with ? placeholders
 * @param {Array} params - Query parameters
 * @returns {Promise} - Query results or write result object
 */
async function query(sql, params = []) {
    const convertedSql = convertQuery(sql);
    const isWrite = isWriteQuery(sql);
    const isInsert = isInsertQuery(sql);

    try {
        let finalSql = convertedSql;

        // Add RETURNING id to INSERT queries
        if (isInsert) {
            finalSql = addReturningId(convertedSql);
        }

        const result = await pool.query(finalSql, params);

        if (isWrite) {
            // Return SQLite/MySQL compatible result object
            return {
                insertId: result.rows && result.rows[0] ? result.rows[0].id : null,
                affectedRows: result.rowCount,
                rows: result.rows
            };
        }

        // For SELECT queries, return rows array
        return result.rows;
    } catch (error) {
        console.error('[DB] Query failed:', error.message);
        console.error('[DB] Original SQL:', sql);
        console.error('[DB] Converted SQL:', convertedSql);
        console.error('[DB] Params:', params);
        throw error;
    }
}

/**
 * Get connection for transactions
 * Provides MySQL/SQLite-compatible interface
 */
async function getConnection() {
    const client = await pool.connect();

    return {
        beginTransaction: async () => {
            await client.query('BEGIN');
        },

        execute: async (sql, params = []) => {
            const convertedSql = convertQuery(sql);
            const isWrite = isWriteQuery(sql);
            const isInsert = isInsertQuery(sql);

            let finalSql = convertedSql;
            if (isInsert) {
                finalSql = addReturningId(convertedSql);
            }

            const result = await client.query(finalSql, params);

            if (isWrite) {
                return [{
                    insertId: result.rows && result.rows[0] ? result.rows[0].id : null,
                    affectedRows: result.rowCount
                }, null];
            }

            return [result.rows, null];
        },

        commit: async () => {
            await client.query('COMMIT');
        },

        rollback: async () => {
            try {
                await client.query('ROLLBACK');
            } catch (e) {
                // Ignore rollback errors
            }
        },

        release: () => {
            client.release();
        },

        // Direct query method for raw pg-style usage (for transactions)
        query: async (sql, params = []) => {
            const convertedSql = convertQuery(sql);
            return await client.query(convertedSql, params);
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
 * Split SQL while respecting dollar-quoted strings (like $$ ... $$)
 * This prevents splitting on semicolons inside trigger function bodies
 */
function splitSQLStatements(sql) {
    const statements = [];
    let current = '';
    let inDollarQuote = false;
    let dollarQuoteTag = '';

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];

        // Check for dollar quote start/end
        if (char === '$') {
            // Look for dollar quote pattern: $ or $tag$
            let j = i + 1;
            while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) {
                j++;
            }
            if (j < sql.length && sql[j] === '$') {
                const tag = sql.slice(i, j + 1);
                if (!inDollarQuote) {
                    // Starting a dollar-quoted string
                    inDollarQuote = true;
                    dollarQuoteTag = tag;
                    current += sql.slice(i, j + 1);
                    i = j;
                    continue;
                } else if (tag === dollarQuoteTag) {
                    // Ending the dollar-quoted string
                    inDollarQuote = false;
                    dollarQuoteTag = '';
                    current += sql.slice(i, j + 1);
                    i = j;
                    continue;
                }
            }
        }

        // Check for statement end (semicolon not in dollar quote)
        if (char === ';' && !inDollarQuote) {
            const stmt = stripLeadingComments(current.trim());
            if (stmt.length > 0) {
                statements.push(stmt);
            }
            current = '';
            continue;
        }

        current += char;
    }

    // Add any remaining statement
    const stmt = stripLeadingComments(current.trim());
    if (stmt.length > 0) {
        statements.push(stmt);
    }

    return statements;
}

/**
 * Strip leading SQL comments from a statement
 * Handles both multi-line comments and inline comments (-- comment followed by SQL on same line)
 */
function stripLeadingComments(sql) {
    let result = sql;

    // First, handle multi-line: strip lines that are pure comments
    const lines = result.split('\n');
    let startIndex = 0;

    // Skip leading comment lines and blank lines
    while (startIndex < lines.length) {
        const line = lines[startIndex].trim();
        if (line === '' || (line.startsWith('--') && !line.includes('CREATE') && !line.includes('INSERT') && !line.includes('ALTER') && !line.includes('DROP'))) {
            startIndex++;
        } else {
            break;
        }
    }

    result = lines.slice(startIndex).join('\n').trim();

    // Now handle inline: if line starts with -- but has SQL after, strip the comment prefix
    // Pattern: "-- comment textCREATE..." or "-- commentINSERT..."
    if (result.startsWith('--')) {
        // Find where actual SQL starts (CREATE, INSERT, ALTER, DROP, DO, etc.)
        const sqlKeywords = ['CREATE', 'INSERT', 'ALTER', 'DROP', 'DO', 'UPDATE', 'DELETE', 'SELECT'];
        for (const keyword of sqlKeywords) {
            const idx = result.indexOf(keyword);
            if (idx > 0) {
                result = result.substring(idx);
                break;
            }
        }
    }

    return result.trim();
}

/**
 * Initialize database schema
 */
async function initializeDatabase() {
    console.log('[DB] Initializing PostgreSQL database...');

    try {
        // Read schema file
        const schemaPath = path.join(__dirname, '../database/schema-postgres.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            console.log('[DB] Schema file size:', schema.length, 'bytes');

            // Split by semicolons while respecting dollar-quoted strings
            const statements = splitSQLStatements(schema);

            console.log('[DB] Found', statements.length, 'SQL statements to execute');

            let successCount = 0;
            let errorCount = 0;
            for (const stmt of statements) {
                try {
                    await pool.query(stmt);
                    successCount++;
                } catch (stmtError) {
                    if (!stmtError.message.includes('already exists')) {
                        console.error('[DB] Statement error:', stmtError.message);
                        console.error('[DB] Failed statement (first 200 chars):', stmt.substring(0, 200));
                        errorCount++;
                    }
                }
            }
            console.log('[DB] Schema initialized:', successCount, 'succeeded,', errorCount, 'failed');
        } else {
            console.warn('[DB] Schema file not found:', schemaPath);
        }
    } catch (error) {
        console.error('[DB] Schema initialization error:', error.message);
    }
}

/**
 * Close database connections (for cleanup)
 */
async function close() {
    await pool.end();
}

/**
 * Get database info
 */
function getDbInfo() {
    return {
        type: 'postgresql',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'streampanel'
    };
}

// Export raw pool for direct access if needed
module.exports = {
    pool,           // Raw pool for direct access
    query,          // Promise-based query function
    getConnection,  // Get connection for transactions
    testConnection,
    initializeDatabase,
    close,
    getDbInfo,
    convertQuery    // Export for testing
};
