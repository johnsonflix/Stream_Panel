/**
 * Backup & Restore Routes
 * API endpoints for system backup and granular restore
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database-config');
const { requireAuth, requireAdmin } = require('../middleware/auth-middleware');
const BackupService = require('../services/backup-service');

const BACKUP_DIR = process.env.BACKUP_DIR || '/app/backups';
const backupService = new BackupService(db);

// Configure multer for backup file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }
        cb(null, BACKUP_DIR);
    },
    filename: (req, file, cb) => {
        // Keep original filename if it's a valid backup file
        if (file.originalname.startsWith('streampanel-backup-') && file.originalname.endsWith('.zip')) {
            cb(null, file.originalname);
        } else {
            // Generate a new name
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            cb(null, `streampanel-backup-${timestamp}-uploaded.zip`);
        }
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
            cb(null, true);
        } else {
            cb(new Error('Only .zip files are allowed'));
        }
    }
});

/**
 * GET /api/v2/backup/groups
 * Get available restore groups
 */
router.get('/groups', (req, res) => {
    try {
        const groups = backupService.getRestoreGroups();
        res.json({ success: true, groups });
    } catch (error) {
        console.error('Error getting restore groups:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v2/backup/list
 * List all available backups
 */
router.get('/list', async (req, res) => {
    try {
        const backups = await backupService.listBackups();
        res.json({ success: true, backups });
    } catch (error) {
        console.error('Error listing backups:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v2/backup/create
 * Create a new backup
 */
router.post('/create', async (req, res) => {
    try {
        console.log('Creating backup...');
        const result = await backupService.createBackup();
        console.log('Backup created:', result.filename);
        res.json({
            success: true,
            backup: {
                filename: result.filename,
                size: result.size,
                manifest: result.manifest
            }
        });
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v2/backup/download/:filename
 * Download a backup file
 */
router.get('/download/:filename', (req, res) => {
    try {
        const { filename } = req.params;

        // Security: validate filename format
        if (!filename.startsWith('streampanel-backup-') || !filename.endsWith('.zip')) {
            return res.status(400).json({ success: false, error: 'Invalid backup filename' });
        }

        const filePath = path.join(BACKUP_DIR, filename);

        // Security: ensure the path is within backup directory
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(path.resolve(BACKUP_DIR))) {
            return res.status(400).json({ success: false, error: 'Invalid path' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Backup not found' });
        }

        res.download(filePath, filename);
    } catch (error) {
        console.error('Error downloading backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/v2/backup/:filename
 * Delete a backup file
 */
router.delete('/:filename', async (req, res) => {
    try {
        const { filename } = req.params;

        // Security: validate filename format
        if (!filename.startsWith('streampanel-backup-') || !filename.endsWith('.zip')) {
            return res.status(400).json({ success: false, error: 'Invalid backup filename' });
        }

        await backupService.deleteBackup(filename);
        res.json({ success: true, message: 'Backup deleted' });
    } catch (error) {
        console.error('Error deleting backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v2/backup/upload
 * Upload a backup file
 */
router.post('/upload', upload.single('backup'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        // Validate the backup has a manifest
        const filePath = req.file.path;
        try {
            const manifest = await backupService.readManifestFromZip(filePath);
            res.json({
                success: true,
                backup: {
                    filename: req.file.filename,
                    size: req.file.size,
                    manifest
                }
            });
        } catch (manifestError) {
            // Delete invalid backup
            fs.unlinkSync(filePath);
            return res.status(400).json({
                success: false,
                error: 'Invalid backup file: ' + manifestError.message
            });
        }
    } catch (error) {
        console.error('Error uploading backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v2/backup/manifest/:filename
 * Get the manifest for a specific backup
 */
router.get('/manifest/:filename', async (req, res) => {
    try {
        const { filename } = req.params;

        // Security: validate filename format
        if (!filename.startsWith('streampanel-backup-') || !filename.endsWith('.zip')) {
            return res.status(400).json({ success: false, error: 'Invalid backup filename' });
        }

        const filePath = path.join(BACKUP_DIR, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Backup not found' });
        }

        const manifest = await backupService.readManifestFromZip(filePath);
        res.json({ success: true, manifest });
    } catch (error) {
        console.error('Error reading manifest:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v2/backup/restore
 * Restore from a backup (full or granular)
 */
router.post('/restore', async (req, res) => {
    try {
        const { filename, groups } = req.body;

        if (!filename) {
            return res.status(400).json({ success: false, error: 'Filename is required' });
        }

        // Security: validate filename format
        if (!filename.startsWith('streampanel-backup-') || !filename.endsWith('.zip')) {
            return res.status(400).json({ success: false, error: 'Invalid backup filename' });
        }

        // Default to full restore if no groups specified
        const restoreGroups = groups && groups.length > 0 ? groups : ['full'];

        console.log(`Starting restore from ${filename}, groups:`, restoreGroups);
        const result = await backupService.restore(filename, restoreGroups);
        console.log('Restore completed:', result);

        res.json({
            success: true,
            restored: result.restored,
            requiresRestart: result.requiresRestart,
            message: result.requiresRestart
                ? 'Restore completed. App restart recommended for changes to take full effect.'
                : 'Restore completed successfully.'
        });
    } catch (error) {
        console.error('Error restoring backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v2/backup/restart
 * Trigger app restart (after restore)
 */
router.post('/restart', (req, res) => {
    res.json({ success: true, message: 'App will restart in 2 seconds' });

    // Give time for response to send
    setTimeout(() => {
        console.log('Restarting app after restore...');
        process.exit(0); // Docker will restart the container
    }, 2000);
});

module.exports = router;
