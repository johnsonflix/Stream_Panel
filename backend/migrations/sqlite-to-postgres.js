/**
 * SQLite to PostgreSQL Migration Script
 *
 * Migrates all data from a SQLite database backup to PostgreSQL.
 * Run with: node migrations/sqlite-to-postgres.js /path/to/database.sqlite
 */

const { Pool } = require('pg');
const path = require('path');

// Tables to migrate in dependency order (foreign key constraints)
const MIGRATION_ORDER = [
    // Independent tables first
    'owners',
    'plex_servers',
    'iptv_panels',
    'tags',
    'plex_packages',
    'iptv_packages',
    'subscription_plans',
    'users',
    'email_templates',
    'email_schedules',
    'email_logs',
    'settings',
    'payment_providers',
    'portal_customization',
    'portal_announcements',
    'portal_apps',

    // Tables with foreign keys
    'user_tags',
    'user_plex_shares',
    'sessions',
    'portal_sessions',
    'portal_service_requests',
    'portal_messages',

    // IPTV related
    'iptv_bouquets',
    'iptv_channel_groups',
    'iptv_editor_playlists',
    'iptv_editor_users',
    'iptv_editor_playlist_channels',
    'iptv_editor_settings',
    'iptv_activity_log',
    'iptv_sync_logs',
    'guide_cache',
    'playlist_channel_cache',

    // Dashboard and cache
    'dashboard_cache',
    'dashboard_cached_stats',
    'dashboard_library_preferences',

    // Request Site tables
    'request_site_settings',
    'request_settings',
    'request_default_permissions',
    'request_site_media',
    'request_site_requests',
    'request_site_seasons',
    'request_site_blacklist',
    'request_user_permissions',
    'blocked_media',
    'media_managers',
    'request_site_notification_settings',
    'request_site_notification_templates',
    'request_site_webpush_subscriptions',
    'request_servers',
    'media_requests',
    'radarr_library_cache',
    'sonarr_library_cache',
    'plex_guid_cache',

    // Admin
    'admin_notifications',
    'migration_history',

    // Subscription types
    'subscription_types',
];

// PostgreSQL connection
const pgPool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'streampanel',
    user: process.env.DB_USER || 'streampanel',
    password: process.env.DB_PASSWORD || 'streampanel_secure_password',
});

async function getSqliteTables(sqlite) {
    return new Promise((resolve, reject) => {
        sqlite.all(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(r => r.name));
            }
        );
    });
}

async function getTableData(sqlite, tableName) {
    return new Promise((resolve, reject) => {
        sqlite.all(`SELECT * FROM "${tableName}"`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function getTableColumns(sqlite, tableName) {
    return new Promise((resolve, reject) => {
        sqlite.all(`PRAGMA table_info("${tableName}")`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(r => r.name));
        });
    });
}

async function tableExistsInPostgres(tableName) {
    try {
        const result = await pgPool.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
            [tableName]
        );
        return result.rows[0].exists;
    } catch (err) {
        return false;
    }
}

async function getPostgresColumns(tableName) {
    const result = await pgPool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        [tableName]
    );
    return result.rows.map(r => r.column_name);
}

async function migrateTable(sqlite, tableName) {
    console.log(`\n📦 Migrating table: ${tableName}`);

    // Check if table exists in PostgreSQL
    const pgExists = await tableExistsInPostgres(tableName);
    if (!pgExists) {
        console.log(`   ⚠️  Table ${tableName} doesn't exist in PostgreSQL - skipping`);
        return { table: tableName, status: 'skipped', reason: 'not in postgres' };
    }

    // Get data from SQLite
    let data;
    try {
        data = await getTableData(sqlite, tableName);
    } catch (err) {
        console.log(`   ⚠️  Table ${tableName} doesn't exist in SQLite - skipping`);
        return { table: tableName, status: 'skipped', reason: 'not in sqlite' };
    }

    if (data.length === 0) {
        console.log(`   ℹ️  Table ${tableName} is empty - nothing to migrate`);
        return { table: tableName, status: 'empty', rows: 0 };
    }

    // Get column info
    const sqliteColumns = await getTableColumns(sqlite, tableName);
    const pgColumns = await getPostgresColumns(tableName);

    // Find common columns (only migrate columns that exist in both)
    const commonColumns = sqliteColumns.filter(col => pgColumns.includes(col));

    if (commonColumns.length === 0) {
        console.log(`   ⚠️  No common columns between SQLite and PostgreSQL - skipping`);
        return { table: tableName, status: 'skipped', reason: 'no common columns' };
    }

    console.log(`   📊 Found ${data.length} rows, ${commonColumns.length} columns to migrate`);

    // Truncate existing data in PostgreSQL (optional - be careful!)
    try {
        await pgPool.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
        console.log(`   🗑️  Cleared existing data`);
    } catch (err) {
        // Table might have dependencies, try without cascade
        try {
            await pgPool.query(`DELETE FROM "${tableName}"`);
            console.log(`   🗑️  Deleted existing data`);
        } catch (err2) {
            console.log(`   ⚠️  Could not clear existing data: ${err2.message}`);
        }
    }

    // Build INSERT statement
    const columnList = commonColumns.map(c => `"${c}"`).join(', ');
    const placeholders = commonColumns.map((_, i) => `$${i + 1}`).join(', ');
    const insertSql = `INSERT INTO "${tableName}" (${columnList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

    let successCount = 0;
    let errorCount = 0;

    // Insert data in batches
    for (const row of data) {
        const values = commonColumns.map(col => {
            let val = row[col];
            // Handle null values
            if (val === undefined) val = null;
            // Handle boolean-like integers for PostgreSQL
            return val;
        });

        try {
            await pgPool.query(insertSql, values);
            successCount++;
        } catch (err) {
            errorCount++;
            if (errorCount <= 3) {
                console.log(`   ❌ Error inserting row: ${err.message}`);
            }
        }
    }

    console.log(`   ✅ Migrated ${successCount}/${data.length} rows (${errorCount} errors)`);

    // Reset sequence if table has serial primary key
    if (pgColumns.includes('id')) {
        try {
            await pgPool.query(`SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 0) + 1, false)`);
            console.log(`   🔢 Reset ID sequence`);
        } catch (err) {
            // Not all tables have sequences
        }
    }

    return { table: tableName, status: 'migrated', rows: successCount, errors: errorCount };
}

async function runMigration(sqlitePath) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  SQLite to PostgreSQL Migration');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📂 SQLite source: ${sqlitePath}`);
    console.log('');

    // Load sqlite3
    let sqlite3;
    try {
        sqlite3 = require('sqlite3').verbose();
    } catch (err) {
        console.error('❌ sqlite3 module not found. Install with: npm install sqlite3');
        process.exit(1);
    }

    // Open SQLite database
    const sqlite = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            console.error('❌ Failed to open SQLite database:', err.message);
            process.exit(1);
        }
    });

    // Get all SQLite tables
    const sqliteTables = await getSqliteTables(sqlite);
    console.log(`📋 Found ${sqliteTables.length} tables in SQLite`);

    // Determine migration order
    const tablesToMigrate = [];

    // First, add tables in our defined order
    for (const table of MIGRATION_ORDER) {
        if (sqliteTables.includes(table)) {
            tablesToMigrate.push(table);
        }
    }

    // Then add any remaining tables not in our list
    for (const table of sqliteTables) {
        if (!tablesToMigrate.includes(table)) {
            tablesToMigrate.push(table);
        }
    }

    console.log(`📝 Will migrate ${tablesToMigrate.length} tables\n`);

    // Disable foreign key checks during migration
    await pgPool.query('SET session_replication_role = replica');

    const results = [];

    // Migrate each table
    for (const table of tablesToMigrate) {
        try {
            const result = await migrateTable(sqlite, table);
            results.push(result);
        } catch (err) {
            console.log(`   ❌ Fatal error migrating ${table}: ${err.message}`);
            results.push({ table, status: 'error', error: err.message });
        }
    }

    // Re-enable foreign key checks
    await pgPool.query('SET session_replication_role = DEFAULT');

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Migration Summary');
    console.log('═══════════════════════════════════════════════════════════');

    const migrated = results.filter(r => r.status === 'migrated');
    const skipped = results.filter(r => r.status === 'skipped');
    const empty = results.filter(r => r.status === 'empty');
    const errors = results.filter(r => r.status === 'error');

    console.log(`✅ Migrated: ${migrated.length} tables`);
    console.log(`⏭️  Skipped:  ${skipped.length} tables`);
    console.log(`📭 Empty:    ${empty.length} tables`);
    console.log(`❌ Errors:   ${errors.length} tables`);

    const totalRows = migrated.reduce((sum, r) => sum + (r.rows || 0), 0);
    console.log(`\n📊 Total rows migrated: ${totalRows}`);

    if (errors.length > 0) {
        console.log('\n❌ Tables with errors:');
        errors.forEach(e => console.log(`   - ${e.table}: ${e.error}`));
    }

    // Close connections
    sqlite.close();
    await pgPool.end();

    console.log('\n✅ Migration complete!\n');
}

// Main
const sqlitePath = process.argv[2] || '/app/backups/migrate-temp/database.sqlite';
runMigration(sqlitePath).catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
