const { db, query } = require('../database-config');

/**
 * Fix the owner_id foreign key constraint
 *
 * The owner_id column currently references owners(id), but the application
 * uses users with is_app_user=1 as owners. We need to either:
 * 1. Remove the FK constraint entirely (let app handle validation)
 * 2. Change FK to reference users(id)
 *
 * Since SQLite doesn't support ALTER TABLE DROP CONSTRAINT, we need to
 * recreate the table. We'll remove the FK constraint entirely for simplicity.
 */
async function up() {
    console.log('Starting owner_id FK constraint fix...');

    try {
        // Disable foreign keys temporarily for this migration
        db.pragma('foreign_keys = OFF');
        console.log('Disabled foreign key checks');

        // Get current table schema
        const tableInfo = await query("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
        if (!tableInfo.length) {
            throw new Error('users table not found');
        }

        console.log('Creating new users table without owner_id FK constraint...');

        // Start a transaction
        db.prepare('BEGIN TRANSACTION').run();

        try {
            // Create new table with correct structure (removing the owner_id FK)
            await query(`
                CREATE TABLE users_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    email TEXT,
                    plex_email TEXT,
                    plex_package_id INTEGER,
                    plex_expiration TEXT,
                    plex_status TEXT,
                    pending_plex_invites TEXT,
                    iptv_panel_id INTEGER,
                    iptv_username TEXT,
                    iptv_password TEXT,
                    iptv_line_id TEXT,
                    iptv_package_id TEXT,
                    iptv_package_name TEXT,
                    iptv_expiration TEXT,
                    iptv_connections INTEGER,
                    iptv_is_trial INTEGER,
                    iptv_m3u_url TEXT,
                    iptv_credits_used INTEGER,
                    iptv_editor_enabled INTEGER,
                    iptv_editor_m3u_url TEXT,
                    iptv_editor_epg_url TEXT,
                    implayer_code TEXT,
                    device_count INTEGER,
                    owner_id INTEGER,
                    notes TEXT,
                    is_active INTEGER,
                    created_at TEXT,
                    updated_at TEXT,
                    account_type TEXT,
                    plex_enabled INTEGER,
                    plex_expiration_date TEXT,
                    iptv_enabled INTEGER,
                    iptv_expiration_date TEXT,
                    iptv_duration_months INTEGER,
                    password_hash TEXT,
                    role TEXT,
                    last_login TEXT,
                    login_attempts INTEGER,
                    account_locked_until TEXT,
                    is_app_user INTEGER,
                    preferences TEXT,
                    password_reset_token TEXT,
                    password_reset_expires DATETIME,
                    is_first_login INTEGER,
                    telegram_username TEXT,
                    whatsapp_username TEXT,
                    discord_username TEXT,
                    venmo_username TEXT,
                    paypal_username TEXT,
                    cashapp_username TEXT,
                    google_pay_username TEXT,
                    apple_cash_username TEXT,
                    plex_username TEXT,
                    iptv_email TEXT,
                    exclude_from_bulk_emails INTEGER,
                    bcc_owner_on_renewal INTEGER,
                    plex_last_activity_date TEXT,
                    plex_days_since_last_activity INTEGER,
                    plex_activity_sync_timestamp TEXT,
                    iptv_editor_id TEXT,
                    iptv_editor_username TEXT,
                    iptv_editor_password TEXT,
                    iptv_channel_group_id INTEGER DEFAULT NULL,
                    iptv_panel_package_id TEXT DEFAULT NULL,
                    iptv_subscription_plan_id INTEGER DEFAULT NULL,
                    exclude_from_automated_emails INTEGER DEFAULT 0,
                    plex_subscription_plan_id INTEGER REFERENCES subscription_plans(id),
                    plex_sso_enabled INTEGER DEFAULT 0,
                    plex_sso_server_ids TEXT DEFAULT NULL,
                    plex_sso_email TEXT DEFAULT NULL,
                    plex_sso_username TEXT DEFAULT NULL,
                    plex_sso_thumb TEXT DEFAULT NULL,
                    plex_sso_last_verified TEXT DEFAULT NULL,
                    payment_preference TEXT DEFAULT 'global',
                    custom_payment_methods TEXT DEFAULT '[]',
                    plex_cancelled_at TEXT DEFAULT NULL,
                    plex_scheduled_deletion TEXT DEFAULT NULL,
                    iptv_cancelled_at TEXT DEFAULT NULL,
                    iptv_scheduled_deletion TEXT DEFAULT NULL,
                    plex_cancellation_reason TEXT DEFAULT NULL,
                    iptv_cancellation_reason TEXT DEFAULT NULL,
                    last_iptv_activity DATETIME,
                    plex_sso_required INTEGER DEFAULT 0,
                    rs_has_access INTEGER DEFAULT NULL,

                    FOREIGN KEY (iptv_panel_id) REFERENCES iptv_panels(id) ON DELETE SET NULL
                )
            `);
            console.log('Created users_new table');

            // Copy data from old table
            await query(`
                INSERT INTO users_new SELECT
                    id, name, email, plex_email, plex_package_id, plex_expiration, plex_status,
                    pending_plex_invites, iptv_panel_id, iptv_username, iptv_password, iptv_line_id,
                    iptv_package_id, iptv_package_name, iptv_expiration, iptv_connections, iptv_is_trial,
                    iptv_m3u_url, iptv_credits_used, iptv_editor_enabled, iptv_editor_m3u_url,
                    iptv_editor_epg_url, implayer_code, device_count, owner_id, notes, is_active,
                    created_at, updated_at, account_type, plex_enabled, plex_expiration_date,
                    iptv_enabled, iptv_expiration_date, iptv_duration_months, password_hash, role,
                    last_login, login_attempts, account_locked_until, is_app_user, preferences,
                    password_reset_token, password_reset_expires, is_first_login, telegram_username,
                    whatsapp_username, discord_username, venmo_username, paypal_username,
                    cashapp_username, google_pay_username, apple_cash_username, plex_username,
                    iptv_email, exclude_from_bulk_emails, bcc_owner_on_renewal,
                    plex_last_activity_date, plex_days_since_last_activity, plex_activity_sync_timestamp,
                    iptv_editor_id, iptv_editor_username, iptv_editor_password,
                    iptv_channel_group_id, iptv_panel_package_id, iptv_subscription_plan_id,
                    exclude_from_automated_emails, plex_subscription_plan_id, plex_sso_enabled,
                    plex_sso_server_ids, plex_sso_email, plex_sso_username, plex_sso_thumb,
                    plex_sso_last_verified, payment_preference, custom_payment_methods,
                    plex_cancelled_at, plex_scheduled_deletion, iptv_cancelled_at,
                    iptv_scheduled_deletion, plex_cancellation_reason, iptv_cancellation_reason,
                    last_iptv_activity, plex_sso_required, rs_has_access
                FROM users
            `);
            console.log('Copied data to users_new');

            // Drop old table
            await query('DROP TABLE users');
            console.log('Dropped old users table');

            // Rename new table
            await query('ALTER TABLE users_new RENAME TO users');
            console.log('Renamed users_new to users');

            // Recreate indexes
            await query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
            await query('CREATE INDEX IF NOT EXISTS idx_users_is_app_user ON users(is_app_user)');
            await query('CREATE INDEX IF NOT EXISTS idx_users_owner_id ON users(owner_id)');
            console.log('Recreated indexes');

            // Commit transaction
            db.prepare('COMMIT').run();
            console.log('Committed transaction');

        } catch (error) {
            // Rollback on error
            db.prepare('ROLLBACK').run();
            throw error;
        }

        // Re-enable foreign keys
        db.pragma('foreign_keys = ON');
        console.log('Re-enabled foreign key checks');

        // Verify the change
        const newSchema = await query("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
        console.log('New schema (truncated):', newSchema[0]?.sql?.substring(0, 300) + '...');

        console.log('Migration completed successfully!');

    } catch (error) {
        // Make sure foreign keys are re-enabled even on error
        db.pragma('foreign_keys = ON');
        console.error('Error in migration:', error);
        throw error;
    }
}

async function down() {
    console.log('Note: This migration cannot be easily reversed.');
    console.log('The owner_id FK constraint has been removed.');
}

module.exports = { up, down };

// Run if executed directly
if (require.main === module) {
    up().then(() => {
        console.log('Migration completed');
        process.exit(0);
    }).catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}
