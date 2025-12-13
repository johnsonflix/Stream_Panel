/**
 * Migration: Create Portal Service Requests
 *
 * Creates the portal_service_requests table for tracking user service/renewal requests
 * Also adds portal visibility fields to subscription_plans table
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'subsapp_v2.db');

function migrate() {
    const db = new Database(dbPath);

    console.log('Creating portal service requests system...');

    try {
        // Check if table already exists
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='portal_service_requests'").get();

        if (!tableExists) {
            // Create portal_service_requests table
            db.exec(`
                CREATE TABLE portal_service_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    service_type TEXT NOT NULL,
                    subscription_plan_id INTEGER,
                    request_type TEXT NOT NULL DEFAULT 'new_service',
                    payment_status TEXT NOT NULL DEFAULT 'pending',
                    transaction_reference TEXT,
                    user_notes TEXT,
                    admin_notes TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    processed_at DATETIME,
                    processed_by INTEGER,
                    notified_at DATETIME,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id),
                    FOREIGN KEY (processed_by) REFERENCES app_users(id)
                )
            `);
            console.log('  Created portal_service_requests table');

            // Create indexes separately
            db.exec(`CREATE INDEX idx_service_requests_user_id ON portal_service_requests(user_id)`);
            db.exec(`CREATE INDEX idx_service_requests_status ON portal_service_requests(payment_status)`);
            db.exec(`CREATE INDEX idx_service_requests_created ON portal_service_requests(created_at)`);
            console.log('  Created indexes');
        } else {
            console.log('  portal_service_requests table already exists');

            // Check for missing columns and add them
            const serviceRequestsInfo = db.pragma('table_info(portal_service_requests)');
            const serviceRequestsCols = serviceRequestsInfo.map(col => col.name);

            if (!serviceRequestsCols.includes('subscription_plan_id')) {
                db.exec(`ALTER TABLE portal_service_requests ADD COLUMN subscription_plan_id INTEGER`);
                console.log('  Added subscription_plan_id column to portal_service_requests');
            }
            if (!serviceRequestsCols.includes('request_type')) {
                db.exec(`ALTER TABLE portal_service_requests ADD COLUMN request_type TEXT DEFAULT 'new_service'`);
                console.log('  Added request_type column to portal_service_requests');
            }
            if (!serviceRequestsCols.includes('payment_status')) {
                db.exec(`ALTER TABLE portal_service_requests ADD COLUMN payment_status TEXT DEFAULT 'pending'`);
                console.log('  Added payment_status column to portal_service_requests');
            }
            if (!serviceRequestsCols.includes('transaction_reference')) {
                db.exec(`ALTER TABLE portal_service_requests ADD COLUMN transaction_reference TEXT`);
                console.log('  Added transaction_reference column to portal_service_requests');
            }
            if (!serviceRequestsCols.includes('user_notes')) {
                db.exec(`ALTER TABLE portal_service_requests ADD COLUMN user_notes TEXT`);
                console.log('  Added user_notes column to portal_service_requests');
            }
            if (!serviceRequestsCols.includes('admin_notes')) {
                db.exec(`ALTER TABLE portal_service_requests ADD COLUMN admin_notes TEXT`);
                console.log('  Added admin_notes column to portal_service_requests');
            }
            if (!serviceRequestsCols.includes('processed_at')) {
                db.exec(`ALTER TABLE portal_service_requests ADD COLUMN processed_at DATETIME`);
                console.log('  Added processed_at column to portal_service_requests');
            }
            if (!serviceRequestsCols.includes('processed_by')) {
                db.exec(`ALTER TABLE portal_service_requests ADD COLUMN processed_by INTEGER`);
                console.log('  Added processed_by column to portal_service_requests');
            }
            if (!serviceRequestsCols.includes('notified_at')) {
                db.exec(`ALTER TABLE portal_service_requests ADD COLUMN notified_at DATETIME`);
                console.log('  Added notified_at column to portal_service_requests');
            }
        }

        // Add portal visibility fields to subscription_plans
        const tableInfo = db.pragma('table_info(subscription_plans)');
        const existingColumns = tableInfo.map(col => col.name);

        if (!existingColumns.includes('show_on_portal')) {
            db.exec(`ALTER TABLE subscription_plans ADD COLUMN show_on_portal INTEGER DEFAULT 1`);
            console.log('  Added show_on_portal column to subscription_plans');
        } else {
            console.log('  show_on_portal column already exists');
        }

        if (!existingColumns.includes('portal_display_order')) {
            db.exec(`ALTER TABLE subscription_plans ADD COLUMN portal_display_order INTEGER DEFAULT 0`);
            console.log('  Added portal_display_order column to subscription_plans');
        } else {
            console.log('  portal_display_order column already exists');
        }

        if (!existingColumns.includes('is_portal_default')) {
            db.exec(`ALTER TABLE subscription_plans ADD COLUMN is_portal_default INTEGER DEFAULT 0`);
            console.log('  Added is_portal_default column to subscription_plans');
        } else {
            console.log('  is_portal_default column already exists');
        }

        if (!existingColumns.includes('portal_description')) {
            db.exec(`ALTER TABLE subscription_plans ADD COLUMN portal_description TEXT`);
            console.log('  Added portal_description column to subscription_plans');
        } else {
            console.log('  portal_description column already exists');
        }

        db.close();

        console.log('');
        console.log('Migration completed successfully!');
        console.log('');

    } catch (error) {
        console.error('Migration failed:', error);
        db.close();
        process.exit(1);
    }
}

// Run migration if executed directly
if (require.main === module) {
    migrate();
}

module.exports = { migrate };
