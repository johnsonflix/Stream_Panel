/**
 * Migration: Add M3U URL field to iptv_panels table
 *
 * Allows panels to specify an M3U playlist URL for content counting
 * when IPTV Editor is not used
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    let connection;

    try {
        // Connect to database
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'subsapp_v2_temp'
        });

        console.log(`📂 Connected to database: ${process.env.DB_NAME || 'subsapp_v2_temp'}`);

        // Check if m3u_url column exists
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME = 'iptv_panels'
            AND COLUMN_NAME = 'm3u_url'
        `, [process.env.DB_NAME || 'subsapp_v2_temp']);

        if (columns.length === 0) {
            console.log('🔄 Adding m3u_url field to iptv_panels table...');
            await connection.query(`
                ALTER TABLE iptv_panels
                ADD COLUMN m3u_url TEXT DEFAULT NULL
            `);
            console.log('✅ Added m3u_url field');
        } else {
            console.log('ℹ️ m3u_url field already exists');
        }

        // Check if m3u_last_sync column exists
        const [syncColumns] = await connection.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME = 'iptv_panels'
            AND COLUMN_NAME = 'm3u_last_sync'
        `, [process.env.DB_NAME || 'subsapp_v2_temp']);

        if (syncColumns.length === 0) {
            console.log('🔄 Adding m3u_last_sync field to iptv_panels table...');
            await connection.query(`
                ALTER TABLE iptv_panels
                ADD COLUMN m3u_last_sync DATETIME DEFAULT NULL
            `);
            console.log('✅ Added m3u_last_sync field');
        } else {
            console.log('ℹ️ m3u_last_sync field already exists');
        }

        // Check if m3u_channel_count column exists
        const [channelColumns] = await connection.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME = 'iptv_panels'
            AND COLUMN_NAME = 'm3u_channel_count'
        `, [process.env.DB_NAME || 'subsapp_v2_temp']);

        if (channelColumns.length === 0) {
            console.log('🔄 Adding m3u_channel_count field to iptv_panels table...');
            await connection.query(`
                ALTER TABLE iptv_panels
                ADD COLUMN m3u_channel_count INT DEFAULT 0
            `);
            console.log('✅ Added m3u_channel_count field');
        } else {
            console.log('ℹ️ m3u_channel_count field already exists');
        }

        // Check if m3u_movie_count column exists
        const [movieColumns] = await connection.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME = 'iptv_panels'
            AND COLUMN_NAME = 'm3u_movie_count'
        `, [process.env.DB_NAME || 'subsapp_v2_temp']);

        if (movieColumns.length === 0) {
            console.log('🔄 Adding m3u_movie_count field to iptv_panels table...');
            await connection.query(`
                ALTER TABLE iptv_panels
                ADD COLUMN m3u_movie_count INT DEFAULT 0
            `);
            console.log('✅ Added m3u_movie_count field');
        } else {
            console.log('ℹ️ m3u_movie_count field already exists');
        }

        // Check if m3u_series_count column exists
        const [seriesColumns] = await connection.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME = 'iptv_panels'
            AND COLUMN_NAME = 'm3u_series_count'
        `, [process.env.DB_NAME || 'subsapp_v2_temp']);

        if (seriesColumns.length === 0) {
            console.log('🔄 Adding m3u_series_count field to iptv_panels table...');
            await connection.query(`
                ALTER TABLE iptv_panels
                ADD COLUMN m3u_series_count INT DEFAULT 0
            `);
            console.log('✅ Added m3u_series_count field');
        } else {
            console.log('ℹ️ m3u_series_count field already exists');
        }

        await connection.end();

        console.log('✅ Migration completed successfully!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        if (connection) await connection.end();
        process.exit(1);
    }
}

migrate();
