/**
 * Migration: Add IPTV VOD visibility settings to users table
 * Allows per-user control over Movies and TV Shows buttons in the portal
 */

const db = require('../database-config');
const { query } = db;

async function up() {
    console.log('Running migration: add-iptv-vod-visibility');

    // Check if columns already exist
    const columns = await query("PRAGMA table_info(users)");
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('show_iptv_movies')) {
        await query(`ALTER TABLE users ADD COLUMN show_iptv_movies INTEGER DEFAULT 1`);
        console.log('Added show_iptv_movies column to users table');
    }

    if (!columnNames.includes('show_iptv_series')) {
        await query(`ALTER TABLE users ADD COLUMN show_iptv_series INTEGER DEFAULT 1`);
        console.log('Added show_iptv_series column to users table');
    }

    console.log('Migration completed: add-iptv-vod-visibility');
}

module.exports = { up };
