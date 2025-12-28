/**
 * Migration: Add Request Site permission columns to users table
 *
 * Extends the users (app_users) table with Request Site-specific permissions and quotas.
 * These can override global defaults set in request_site_settings.
 */

const { query } = require('../database-config');

async function up() {
    console.log('[Migration] Adding Request Site columns to users table...');

    // Request permissions
    await query(`ALTER TABLE users ADD COLUMN rs_can_request INTEGER DEFAULT NULL`);
    await query(`ALTER TABLE users ADD COLUMN rs_can_request_movie INTEGER DEFAULT NULL`);
    await query(`ALTER TABLE users ADD COLUMN rs_can_request_tv INTEGER DEFAULT NULL`);
    await query(`ALTER TABLE users ADD COLUMN rs_can_request_4k INTEGER DEFAULT NULL`);
    await query(`ALTER TABLE users ADD COLUMN rs_can_request_4k_movie INTEGER DEFAULT NULL`);
    await query(`ALTER TABLE users ADD COLUMN rs_can_request_4k_tv INTEGER DEFAULT NULL`);

    // Admin permissions
    await query(`ALTER TABLE users ADD COLUMN rs_can_manage_requests INTEGER DEFAULT 0`);
    await query(`ALTER TABLE users ADD COLUMN rs_can_auto_approve INTEGER DEFAULT NULL`);
    await query(`ALTER TABLE users ADD COLUMN rs_can_auto_approve_movie INTEGER DEFAULT NULL`);
    await query(`ALTER TABLE users ADD COLUMN rs_can_auto_approve_tv INTEGER DEFAULT NULL`);
    await query(`ALTER TABLE users ADD COLUMN rs_can_auto_approve_4k INTEGER DEFAULT NULL`);

    // Granular auto-approve for TV shows
    // NULL = use global default, 0 = never auto-approve TV, N = auto-approve if show has <= N seasons
    await query(`ALTER TABLE users ADD COLUMN rs_auto_approve_tv_max_seasons INTEGER DEFAULT NULL`);

    // Quotas (NULL = use global default, 0 = unlimited)
    await query(`ALTER TABLE users ADD COLUMN rs_movie_quota_limit INTEGER DEFAULT NULL`);
    await query(`ALTER TABLE users ADD COLUMN rs_movie_quota_days INTEGER DEFAULT NULL`);
    await query(`ALTER TABLE users ADD COLUMN rs_tv_quota_limit INTEGER DEFAULT NULL`);
    await query(`ALTER TABLE users ADD COLUMN rs_tv_quota_days INTEGER DEFAULT NULL`);

    console.log('[Migration] Request Site columns added to users table successfully');
    console.log('[Migration] NULL values will use global defaults from request_site_settings');
}

async function down() {
    console.log('[Migration] Removing Request Site columns from users table...');

    // Request permissions
    await query(`ALTER TABLE users DROP COLUMN rs_can_request`);
    await query(`ALTER TABLE users DROP COLUMN rs_can_request_movie`);
    await query(`ALTER TABLE users DROP COLUMN rs_can_request_tv`);
    await query(`ALTER TABLE users DROP COLUMN rs_can_request_4k`);
    await query(`ALTER TABLE users DROP COLUMN rs_can_request_4k_movie`);
    await query(`ALTER TABLE users DROP COLUMN rs_can_request_4k_tv`);

    // Admin permissions
    await query(`ALTER TABLE users DROP COLUMN rs_can_manage_requests`);
    await query(`ALTER TABLE users DROP COLUMN rs_can_auto_approve`);
    await query(`ALTER TABLE users DROP COLUMN rs_can_auto_approve_movie`);
    await query(`ALTER TABLE users DROP COLUMN rs_can_auto_approve_tv`);
    await query(`ALTER TABLE users DROP COLUMN rs_can_auto_approve_4k`);

    // Granular auto-approve
    await query(`ALTER TABLE users DROP COLUMN rs_auto_approve_tv_max_seasons`);

    // Quotas
    await query(`ALTER TABLE users DROP COLUMN rs_movie_quota_limit`);
    await query(`ALTER TABLE users DROP COLUMN rs_movie_quota_days`);
    await query(`ALTER TABLE users DROP COLUMN rs_tv_quota_limit`);
    await query(`ALTER TABLE users DROP COLUMN rs_tv_quota_days`);

    console.log('[Migration] Request Site columns removed from users table');
}

// Run migration
up().then(() => {
    console.log('[Migration] Migration completed successfully!');
    process.exit(0);
}).catch(err => {
    console.error('[Migration] Migration failed:', err);
    process.exit(1);
});
