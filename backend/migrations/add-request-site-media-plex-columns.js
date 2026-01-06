/**
 * Migration: Add Missing Plex Scanner Columns to request_site_media
 *
 * Adds columns needed for:
 * - tvdb_id: TVDB ID for TV shows
 * - imdb_id: IMDB ID for both movies and TV shows
 * - status_4k: 4K availability status
 * - plex_rating_key_4k: Plex rating key for 4K version
 * - plex_server_id: Reference to plex server
 */

const { query } = require('../database-config');

async function up() {
    console.log('[Migration] Adding missing Plex scanner columns to request_site_media...');

    // Add tvdb_id column
    try {
        await query(`ALTER TABLE request_site_media ADD COLUMN tvdb_id INTEGER`);
        console.log('[Migration] Added tvdb_id to request_site_media');
    } catch (e) {
        if (e.message.includes('already exists') || e.message.includes('duplicate column')) {
            console.log('[Migration] tvdb_id column already exists');
        } else {
            console.log('[Migration] Error adding tvdb_id:', e.message);
        }
    }

    // Add imdb_id column
    try {
        await query(`ALTER TABLE request_site_media ADD COLUMN imdb_id TEXT`);
        console.log('[Migration] Added imdb_id to request_site_media');
    } catch (e) {
        if (e.message.includes('already exists') || e.message.includes('duplicate column')) {
            console.log('[Migration] imdb_id column already exists');
        } else {
            console.log('[Migration] Error adding imdb_id:', e.message);
        }
    }

    // Add status_4k column
    try {
        await query(`ALTER TABLE request_site_media ADD COLUMN status_4k TEXT DEFAULT 'unknown'`);
        console.log('[Migration] Added status_4k to request_site_media');
    } catch (e) {
        if (e.message.includes('already exists') || e.message.includes('duplicate column')) {
            console.log('[Migration] status_4k column already exists');
        } else {
            console.log('[Migration] Error adding status_4k:', e.message);
        }
    }

    // Add plex_rating_key_4k column
    try {
        await query(`ALTER TABLE request_site_media ADD COLUMN plex_rating_key_4k TEXT`);
        console.log('[Migration] Added plex_rating_key_4k to request_site_media');
    } catch (e) {
        if (e.message.includes('already exists') || e.message.includes('duplicate column')) {
            console.log('[Migration] plex_rating_key_4k column already exists');
        } else {
            console.log('[Migration] Error adding plex_rating_key_4k:', e.message);
        }
    }

    // Add plex_server_id column
    try {
        await query(`ALTER TABLE request_site_media ADD COLUMN plex_server_id INTEGER`);
        console.log('[Migration] Added plex_server_id to request_site_media');
    } catch (e) {
        if (e.message.includes('already exists') || e.message.includes('duplicate column')) {
            console.log('[Migration] plex_server_id column already exists');
        } else {
            console.log('[Migration] Error adding plex_server_id:', e.message);
        }
    }

    // Make title column nullable if it isn't already (for Plex scanner inserts without title)
    try {
        await query(`ALTER TABLE request_site_media ALTER COLUMN title DROP NOT NULL`);
        console.log('[Migration] Made title column nullable');
    } catch (e) {
        // This might fail if column is already nullable or doesn't have NOT NULL
        console.log('[Migration] title column note:', e.message);
    }

    console.log('[Migration] Plex scanner columns added successfully!');
}

async function down() {
    console.log('[Migration] This migration cannot be safely reversed');
}

// Run migration
up().then(() => {
    console.log('[Migration] Migration completed successfully!');
    process.exit(0);
}).catch(err => {
    console.error('[Migration] Migration failed:', err);
    process.exit(1);
});
