/**
 * Backup & Restore Service
 * Handles full system backups with granular restore capabilities
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Paths
const BACKUP_DIR = process.env.BACKUP_DIR || '/app/backups';
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/backend/uploads';
const DB_PATH = process.env.DB_PATH || '/app/data/subsapp_v2.db';

// Restore groups define which tables belong together
const RESTORE_GROUPS = {
    users: {
        name: 'Users',
        description: 'All end users and their service connections',
        tables: ['users', 'user_plex_shares', 'user_tags', 'portal_sessions', 'portal_service_requests'],
        icon: 'users'
    },
    app_users: {
        name: 'App Users (Admins)',
        description: 'Admin and staff accounts',
        tables: ['app_users'],
        icon: 'user-shield'
    },
    request_site: {
        name: 'Request Site',
        description: 'Media requests, permissions, and settings',
        tables: ['media_requests', 'request_user_permissions', 'request_site_settings', 'blocked_media', 'webpush_subscriptions'],
        icon: 'film'
    },
    plex_config: {
        name: 'Plex Configuration',
        description: 'Plex servers, packages, and libraries',
        tables: ['plex_servers', 'plex_packages', 'plex_libraries', 'plex_package_libraries'],
        icon: 'server'
    },
    iptv_config: {
        name: 'IPTV Configuration',
        description: 'IPTV panels, playlists, and editor settings',
        tables: ['iptv_panels', 'iptv_playlists', 'iptv_editor_playlists', 'iptv_editor_settings', 'guide_cache', 'playlist_channel_cache'],
        icon: 'tv'
    },
    settings: {
        name: 'Settings & Branding',
        description: 'App settings, portal customization, and branding',
        tables: ['settings', 'portal_customization', 'portal_apps', 'portal_guides', 'portal_announcements'],
        folders: ['uploads/branding'],
        icon: 'cog'
    },
    email_system: {
        name: 'Email System',
        description: 'Email templates and schedules',
        tables: ['email_templates', 'email_schedules', 'email_schedule_tracking'],
        icon: 'envelope'
    },
    tags: {
        name: 'Tags',
        description: 'Tag definitions (user assignments restored with Users)',
        tables: ['tags'],
        icon: 'tags'
    },
    plans: {
        name: 'Subscription Plans',
        description: 'Subscription plan definitions',
        tables: ['subscription_plans'],
        icon: 'credit-card'
    },
    media_managers: {
        name: 'Media Managers',
        description: 'Sonarr, Radarr, and other tools',
        tables: ['media_managers'],
        icon: 'tools'
    },
    kometa: {
        name: 'Kometa',
        description: 'Kometa configurations and schedules',
        tables: ['kometa_instances', 'kometa_schedules', 'kometa_collections', 'kometa_overlays'],
        folders: ['data/kometa'],
        icon: 'palette'
    },
    notifications: {
        name: 'Notifications',
        description: 'Notification settings and admin notifications',
        tables: ['admin_notifications', 'notification_settings'],
        icon: 'bell'
    }
};

class BackupService {
    constructor(dbConfig) {
        // dbConfig is the database-config module { db, query, ... }
        this.dbConfig = dbConfig;
        this.ensureBackupDir();
    }

    // Get raw better-sqlite3 database object for direct operations
    getDb() {
        return this.dbConfig.db;
    }

    ensureBackupDir() {
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }
    }

    /**
     * Create a full system backup
     * @returns {Promise<{filename: string, path: string, size: number, manifest: object}>}
     */
    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `streampanel-backup-${timestamp}.zip`;
        const backupPath = path.join(BACKUP_DIR, filename);
        const tempDir = path.join(BACKUP_DIR, `temp-${timestamp}`);

        try {
            // Create temp directory
            fs.mkdirSync(tempDir, { recursive: true });

            // 1. Backup the database using SQLite backup
            const dbBackupPath = path.join(tempDir, 'database.sqlite');
            await this.backupDatabase(dbBackupPath);

            // 2. Get table counts for manifest
            const tableCounts = await this.getTableCounts();

            // 3. Create manifest
            const manifest = {
                version: this.getAppVersion(),
                created: new Date().toISOString(),
                tables: tableCounts,
                restoreGroups: this.getRestoreGroupsInfo(tableCounts),
                folders: []
            };

            // 4. Copy uploads folder if exists
            if (fs.existsSync(UPLOADS_DIR)) {
                const uploadsBackupPath = path.join(tempDir, 'uploads');
                await this.copyDirectory(UPLOADS_DIR, uploadsBackupPath);
                manifest.folders.push('uploads');
            }

            // 5. Copy kometa data if exists
            const kometaDir = path.join(DATA_DIR, 'kometa');
            if (fs.existsSync(kometaDir)) {
                const kometaBackupPath = path.join(tempDir, 'kometa');
                await this.copyDirectory(kometaDir, kometaBackupPath);
                manifest.folders.push('kometa');
            }

            // 6. Write manifest
            fs.writeFileSync(
                path.join(tempDir, 'manifest.json'),
                JSON.stringify(manifest, null, 2)
            );

            // 7. Create zip archive
            await this.createZipArchive(tempDir, backupPath);

            // 8. Get file size
            const stats = fs.statSync(backupPath);

            // 9. Cleanup temp directory
            await this.removeDirectory(tempDir);

            return {
                filename,
                path: backupPath,
                size: stats.size,
                manifest
            };
        } catch (error) {
            // Cleanup on error
            if (fs.existsSync(tempDir)) {
                await this.removeDirectory(tempDir);
            }
            if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath);
            }
            throw error;
        }
    }

    /**
     * Backup SQLite database using the backup API
     */
    async backupDatabase(destPath) {
        return new Promise((resolve, reject) => {
            // Use SQLite's backup API through a new connection
            const sqlite3 = require('better-sqlite3');
            try {
                const sourceDb = sqlite3(DB_PATH, { readonly: true });
                sourceDb.backup(destPath)
                    .then(() => {
                        sourceDb.close();
                        resolve();
                    })
                    .catch((err) => {
                        sourceDb.close();
                        reject(err);
                    });
            } catch (err) {
                // Fallback: copy the file directly (less safe but works)
                try {
                    fs.copyFileSync(DB_PATH, destPath);
                    // Also copy WAL files if they exist
                    if (fs.existsSync(DB_PATH + '-wal')) {
                        fs.copyFileSync(DB_PATH + '-wal', destPath + '-wal');
                    }
                    if (fs.existsSync(DB_PATH + '-shm')) {
                        fs.copyFileSync(DB_PATH + '-shm', destPath + '-shm');
                    }
                    resolve();
                } catch (copyErr) {
                    reject(copyErr);
                }
            }
        });
    }

    /**
     * Get row counts for all tables
     */
    async getTableCounts() {
        const counts = {};
        const db = this.getDb();
        const tables = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
        `).all();

        for (const table of tables) {
            try {
                const result = db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`).get();
                counts[table.name] = result.count;
            } catch (e) {
                counts[table.name] = 0;
            }
        }
        return counts;
    }

    /**
     * Get restore groups with actual counts
     */
    getRestoreGroupsInfo(tableCounts) {
        const groupsInfo = {};
        for (const [key, group] of Object.entries(RESTORE_GROUPS)) {
            let totalRows = 0;
            const tableDetails = {};
            for (const table of group.tables) {
                const count = tableCounts[table] || 0;
                tableDetails[table] = count;
                totalRows += count;
            }
            groupsInfo[key] = {
                name: group.name,
                description: group.description,
                icon: group.icon,
                totalRows,
                tables: tableDetails,
                hasFolders: !!(group.folders && group.folders.length > 0)
            };
        }
        return groupsInfo;
    }

    /**
     * Get app version from version.json
     */
    getAppVersion() {
        try {
            const versionPath = path.join(__dirname, '../../version.json');
            if (fs.existsSync(versionPath)) {
                const version = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
                return version.version;
            }
        } catch (e) {
            // Ignore
        }
        return 'unknown';
    }

    /**
     * List all available backups
     */
    async listBackups() {
        const backups = [];

        if (!fs.existsSync(BACKUP_DIR)) {
            return backups;
        }

        const files = fs.readdirSync(BACKUP_DIR);
        for (const file of files) {
            if (file.endsWith('.zip') && file.startsWith('streampanel-backup-')) {
                const filePath = path.join(BACKUP_DIR, file);
                const stats = fs.statSync(filePath);

                // Try to read manifest from zip
                let manifest = null;
                try {
                    manifest = await this.readManifestFromZip(filePath);
                } catch (e) {
                    // Can't read manifest, still show the backup
                }

                backups.push({
                    filename: file,
                    size: stats.size,
                    created: stats.mtime,
                    manifest
                });
            }
        }

        // Sort by date, newest first
        backups.sort((a, b) => new Date(b.created) - new Date(a.created));
        return backups;
    }

    /**
     * Read manifest from a zip file
     */
    async readManifestFromZip(zipPath) {
        const zip = new AdmZip(zipPath);
        const manifestEntry = zip.getEntry('manifest.json');

        if (!manifestEntry) {
            throw new Error('Manifest not found in backup');
        }

        const manifestContent = manifestEntry.getData().toString('utf8');
        return JSON.parse(manifestContent);
    }

    /**
     * Delete a backup file
     */
    async deleteBackup(filename) {
        const filePath = path.join(BACKUP_DIR, filename);
        if (!fs.existsSync(filePath)) {
            throw new Error('Backup not found');
        }
        // Security: ensure the file is in the backup directory
        if (!filePath.startsWith(BACKUP_DIR)) {
            throw new Error('Invalid backup path');
        }
        fs.unlinkSync(filePath);
        return true;
    }

    /**
     * Restore from a backup file
     * @param {string} filename - The backup filename
     * @param {string[]} groups - Array of restore group keys to restore, or ['full'] for everything
     * @returns {Promise<{success: boolean, restored: object, requiresRestart: boolean}>}
     */
    async restore(filename, groups = ['full']) {
        const filePath = path.join(BACKUP_DIR, filename);
        if (!fs.existsSync(filePath)) {
            throw new Error('Backup file not found');
        }

        const timestamp = Date.now();
        const tempDir = path.join(BACKUP_DIR, `restore-temp-${timestamp}`);
        const restored = { tables: [], folders: [] };
        let requiresRestart = false;

        try {
            // 1. Extract backup to temp directory
            await this.extractZip(filePath, tempDir);

            // 2. Read manifest
            const manifestPath = path.join(tempDir, 'manifest.json');
            if (!fs.existsSync(manifestPath)) {
                throw new Error('Invalid backup: manifest.json not found');
            }
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

            // 3. Determine which tables and folders to restore
            const tablesToRestore = new Set();
            const foldersToRestore = new Set();
            const isFull = groups.includes('full');

            if (isFull) {
                // Full restore - all tables and folders
                for (const group of Object.values(RESTORE_GROUPS)) {
                    group.tables.forEach(t => tablesToRestore.add(t));
                    if (group.folders) {
                        group.folders.forEach(f => foldersToRestore.add(f));
                    }
                }
            } else {
                // Granular restore - only selected groups
                for (const groupKey of groups) {
                    const group = RESTORE_GROUPS[groupKey];
                    if (group) {
                        group.tables.forEach(t => tablesToRestore.add(t));
                        if (group.folders) {
                            group.folders.forEach(f => foldersToRestore.add(f));
                        }
                    }
                }
            }

            // 4. Restore database tables
            const backupDbPath = path.join(tempDir, 'database.sqlite');
            if (fs.existsSync(backupDbPath)) {
                await this.restoreTables(backupDbPath, Array.from(tablesToRestore));
                restored.tables = Array.from(tablesToRestore);
            }

            // 5. Restore folders
            for (const folder of foldersToRestore) {
                const sourcePath = path.join(tempDir, folder);
                let destPath;

                if (folder === 'uploads' || folder.startsWith('uploads/')) {
                    destPath = path.join(UPLOADS_DIR, folder.replace('uploads/', '').replace('uploads', ''));
                    if (folder === 'uploads') destPath = UPLOADS_DIR;
                } else if (folder.startsWith('data/')) {
                    destPath = path.join(DATA_DIR, folder.replace('data/', ''));
                } else {
                    destPath = path.join(DATA_DIR, folder);
                }

                if (fs.existsSync(sourcePath)) {
                    await this.copyDirectory(sourcePath, destPath);
                    restored.folders.push(folder);
                    requiresRestart = true;
                }
            }

            // 6. Cleanup temp directory
            await this.removeDirectory(tempDir);

            // Full restore or settings restore typically requires restart
            if (isFull || groups.includes('settings')) {
                requiresRestart = true;
            }

            return {
                success: true,
                restored,
                requiresRestart
            };
        } catch (error) {
            // Cleanup on error
            if (fs.existsSync(tempDir)) {
                await this.removeDirectory(tempDir);
            }
            throw error;
        }
    }

    /**
     * Restore specific tables from backup database
     */
    async restoreTables(backupDbPath, tables) {
        const sqlite3 = require('better-sqlite3');
        const backupDb = sqlite3(backupDbPath, { readonly: true });
        const db = this.getDb();

        try {
            // Get list of tables that actually exist in backup
            const backupTables = backupDb.prepare(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
            `).all().map(t => t.name);

            for (const table of tables) {
                if (!backupTables.includes(table)) {
                    console.log(`Table ${table} not found in backup, skipping`);
                    continue;
                }

                try {
                    // Check if table exists in current database
                    const tableExists = db.prepare(`
                        SELECT name FROM sqlite_master WHERE type='table' AND name=?
                    `).get(table);

                    if (!tableExists) {
                        console.log(`Table ${table} does not exist in current database, skipping`);
                        continue;
                    }

                    // Get all data from backup
                    const rows = backupDb.prepare(`SELECT * FROM "${table}"`).all();

                    if (rows.length === 0) {
                        // Clear the table even if backup has no data
                        db.prepare(`DELETE FROM "${table}"`).run();
                        continue;
                    }

                    // Get column names from the first row
                    const columns = Object.keys(rows[0]);

                    // Get current table columns
                    const currentColumns = db.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name);

                    // Only use columns that exist in both
                    const commonColumns = columns.filter(c => currentColumns.includes(c));

                    if (commonColumns.length === 0) {
                        console.log(`No common columns for table ${table}, skipping`);
                        continue;
                    }

                    // Clear existing data
                    db.prepare(`DELETE FROM "${table}"`).run();

                    // Insert data
                    const placeholders = commonColumns.map(() => '?').join(', ');
                    const insertStmt = db.prepare(`
                        INSERT INTO "${table}" (${commonColumns.map(c => `"${c}"`).join(', ')})
                        VALUES (${placeholders})
                    `);

                    const insertMany = db.transaction((rows) => {
                        for (const row of rows) {
                            const values = commonColumns.map(c => row[c]);
                            insertStmt.run(...values);
                        }
                    });

                    insertMany(rows);
                    console.log(`Restored ${rows.length} rows to table ${table}`);
                } catch (tableError) {
                    console.error(`Error restoring table ${table}:`, tableError.message);
                    // Continue with other tables
                }
            }
        } finally {
            backupDb.close();
        }
    }

    /**
     * Helper: Create zip archive from directory
     */
    async createZipArchive(sourceDir, destPath) {
        const zip = new AdmZip();

        // Add all files from source directory
        const addDirectory = (dirPath, zipPath = '') => {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const entryZipPath = zipPath ? path.join(zipPath, entry.name) : entry.name;

                if (entry.isDirectory()) {
                    addDirectory(fullPath, entryZipPath);
                } else {
                    zip.addLocalFile(fullPath, zipPath || '');
                }
            }
        };

        addDirectory(sourceDir);
        zip.writeZip(destPath);
    }

    /**
     * Helper: Extract zip to directory
     */
    async extractZip(zipPath, destDir) {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(destDir, true);
    }

    /**
     * Helper: Copy directory recursively
     */
    async copyDirectory(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    /**
     * Helper: Remove directory recursively
     */
    async removeDirectory(dir) {
        if (fs.existsSync(dir)) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await this.removeDirectory(fullPath);
                } else {
                    fs.unlinkSync(fullPath);
                }
            }
            fs.rmdirSync(dir);
        }
    }

    /**
     * Get available restore groups (for UI)
     */
    getRestoreGroups() {
        return RESTORE_GROUPS;
    }
}

module.exports = BackupService;
