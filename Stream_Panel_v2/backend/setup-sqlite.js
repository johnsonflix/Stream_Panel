/**
 * Setup script for SQLite database
 * Run with: node setup-sqlite.js
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config();

async function setupSQLiteDatabase() {
    console.log('🔧 Setting up SQLite database...\n');

    try {
        // Get database path
        const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'subsapp_v2.db');
        console.log(`📦 Database path: ${DB_PATH}\n`);

        // Delete existing database if it exists
        if (fs.existsSync(DB_PATH)) {
            console.log('🗑️  Removing existing database...');
            fs.unlinkSync(DB_PATH);
            console.log('✅ Old database removed\n');
        }

        // Create new database
        console.log('📡 Creating new SQLite database...');
        const db = new Database(DB_PATH);
        console.log('✅ Database created\n');

        // Read schema
        console.log('📋 Loading schema...');
        const schemaPath = path.join(__dirname, '../database/schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        console.log('✅ Schema loaded\n');

        // Execute schema (split by semicolons and execute each statement)
        console.log('⚙️  Executing schema...');
        db.exec(schema);
        console.log('✅ Schema executed successfully\n');

        // Verify tables were created
        const tables = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type='table'
            AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `).all();

        console.log(`✅ Created ${tables.length} tables:`);
        tables.forEach((table, index) => {
            console.log(`   ${index + 1}. ${table.name}`);
        });

        // Verify triggers were created
        const triggers = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type='trigger'
            ORDER BY name
        `).all();

        console.log(`\n✅ Created ${triggers.length} triggers:`);
        triggers.forEach((trigger, index) => {
            console.log(`   ${index + 1}. ${trigger.name}`);
        });

        // Verify indexes were created
        const indexes = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type='index'
            AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `).all();

        console.log(`\n✅ Created ${indexes.length} indexes\n`);

        // Close database
        db.close();

        console.log('🎉 SQLite database setup complete!');
        console.log(`\n📝 Database: ${DB_PATH}`);
        console.log('   You can now start the server with: npm start\n');

    } catch (error) {
        console.error('❌ Error setting up database:', error.message);
        console.error('\n💡 Tips:');
        console.error('   - Check that the schema.sql file exists');
        console.error('   - Make sure you have write permissions');
        console.error('   - Verify better-sqlite3 is installed\n');
        process.exit(1);
    }
}

// Run setup
setupSQLiteDatabase();
