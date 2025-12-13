/**
 * Migration: Create Subscription Plans System
 *
 * Creates a unified subscription plan system that supports:
 * - Plex subscriptions (duration + cost)
 * - IPTV subscriptions (duration + connections + cost)
 * - Future services (Emby, Jellyfin, etc.)
 */

const db = require('../database-config');

async function migrate() {
    console.log('🔄 Creating subscription plans system...');

    try {
        await db.query('BEGIN TRANSACTION');

        // Create subscription_plans table
        await db.query(`
            CREATE TABLE IF NOT EXISTS subscription_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,

                -- Service type
                service_type TEXT NOT NULL CHECK(service_type IN ('plex', 'iptv', 'emby', 'jellyfin', 'combo')),

                -- Pricing
                price REAL NOT NULL DEFAULT 0,
                currency TEXT DEFAULT 'USD',

                -- Duration
                duration_months INTEGER NOT NULL DEFAULT 1,

                -- IPTV specific fields
                iptv_connections INTEGER DEFAULT NULL,
                iptv_panel_id INTEGER DEFAULT NULL,

                -- Plex specific fields
                plex_package_id INTEGER DEFAULT NULL,

                -- Features (JSON array for extensibility)
                features TEXT DEFAULT '[]',

                -- Display & Status
                is_active INTEGER DEFAULT 1,
                display_order INTEGER DEFAULT 0,

                -- Timestamps
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),

                -- Foreign Keys
                FOREIGN KEY (iptv_panel_id) REFERENCES iptv_panels(id) ON DELETE SET NULL,
                FOREIGN KEY (plex_package_id) REFERENCES plex_packages(id) ON DELETE SET NULL
            )
        `);

        console.log('✓ Created subscription_plans table');

        // Create indexes
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_subscription_plans_service_type
            ON subscription_plans(service_type)
        `);

        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_subscription_plans_active
            ON subscription_plans(is_active)
        `);

        console.log('✓ Created indexes');

        // Create trigger for updated_at
        await db.query(`
            CREATE TRIGGER IF NOT EXISTS update_subscription_plans_timestamp
            AFTER UPDATE ON subscription_plans
            FOR EACH ROW
            BEGIN
                UPDATE subscription_plans
                SET updated_at = datetime('now')
                WHERE id = NEW.id;
            END
        `);

        console.log('✓ Created triggers');

        await db.query('COMMIT');

        console.log('✅ Subscription plans system created successfully!');
        console.log('');
        console.log('📋 Summary:');
        console.log('   - Created subscription_plans table');
        console.log('   - Supports: Plex, IPTV, Emby, Jellyfin, Combo plans');
        console.log('   - Added indexes for performance');
        console.log('   - Added update timestamp trigger');
        console.log('');

        process.exit(0);

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrate();
