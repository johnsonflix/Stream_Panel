/**
 * Logs Routes - View application logs from admin panel
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth-middleware');
const {
    LOG_FILES,
    LOG_CATEGORIES,
    LOGS_DIR,
    getLogSettings,
    updateLogSettings,
    runFullCleanup,
    getTotalLogSize
} = require('../utils/logger');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * GET /api/v2/logs/files
 * List available log files
 */
router.get('/files', requireAuth, async (req, res) => {
    try {
        const files = [];

        if (fs.existsSync(LOGS_DIR)) {
            const entries = fs.readdirSync(LOGS_DIR);

            for (const entry of entries) {
                const filePath = path.join(LOGS_DIR, entry);
                const stat = fs.statSync(filePath);

                if (stat.isFile() && entry.endsWith('.log')) {
                    files.push({
                        name: entry,
                        size: stat.size,
                        sizeFormatted: formatBytes(stat.size),
                        modified: stat.mtime.toISOString(),
                        modifiedFormatted: new Date(stat.mtime).toLocaleString()
                    });
                }
            }
        }

        // Sort by modified date (newest first)
        files.sort((a, b) => new Date(b.modified) - new Date(a.modified));

        res.json({
            success: true,
            files: files,
            logsDir: LOGS_DIR
        });

    } catch (error) {
        console.error('[LOGS] Error listing files:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/v2/logs/categories
 * Get log categories for filtering UI
 */
router.get('/categories', requireAuth, async (req, res) => {
    try {
        // Build category info with file stats
        const categories = {};

        for (const [catKey, catInfo] of Object.entries(LOG_CATEGORIES)) {
            categories[catKey] = {
                name: catInfo.name,
                files: catInfo.files.map(fileKey => {
                    const logPath = LOG_FILES[fileKey];
                    const fileName = path.basename(logPath);
                    let stats = { size: 0, modified: null };

                    if (fs.existsSync(logPath)) {
                        const fileStat = fs.statSync(logPath);
                        stats = {
                            size: fileStat.size,
                            sizeFormatted: formatBytes(fileStat.size),
                            modified: fileStat.mtime.toISOString()
                        };
                    }

                    return {
                        key: fileKey,
                        name: fileName,
                        ...stats
                    };
                })
            };
        }

        res.json({
            success: true,
            categories: categories,
            totalSize: getTotalLogSize(),
            totalSizeFormatted: formatBytes(getTotalLogSize())
        });

    } catch (error) {
        console.error('[LOGS] Error getting categories:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/v2/logs/settings
 * Get current log settings
 */
router.get('/settings', requireAuth, async (req, res) => {
    try {
        const settings = getLogSettings();

        res.json({
            success: true,
            settings: settings,
            totalSize: getTotalLogSize(),
            totalSizeFormatted: formatBytes(getTotalLogSize())
        });

    } catch (error) {
        console.error('[LOGS] Error getting settings:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/v2/logs/settings
 * Update log settings
 */
router.put('/settings', requireAuth, async (req, res) => {
    try {
        const { maxFileSizeMB, retentionDays, maxLines } = req.body;

        updateLogSettings({
            maxFileSizeMB,
            retentionDays,
            maxLines
        });

        const newSettings = getLogSettings();

        console.log(`[LOGS] Settings updated: maxFileSizeMB=${newSettings.maxFileSizeMB}, retentionDays=${newSettings.retentionDays}, maxLines=${newSettings.maxLines}`);

        res.json({
            success: true,
            message: 'Log settings updated successfully',
            settings: newSettings
        });

    } catch (error) {
        console.error('[LOGS] Error updating settings:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/v2/logs/cleanup
 * Run log cleanup manually
 */
router.post('/cleanup', requireAuth, async (req, res) => {
    try {
        console.log('[LOGS] Running manual cleanup...');
        const results = runFullCleanup();

        res.json({
            success: true,
            message: 'Log cleanup completed',
            results: results
        });

    } catch (error) {
        console.error('[LOGS] Error running cleanup:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/v2/logs/download/:filename
 * Download a log file
 */
router.get('/download/:filename', requireAuth, async (req, res) => {
    try {
        const { filename } = req.params;

        // Security: prevent directory traversal
        const safeName = path.basename(filename);
        if (!safeName.endsWith('.log')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid log file'
            });
        }

        const filePath = path.join(LOGS_DIR, safeName);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'Log file not found'
            });
        }

        res.download(filePath, safeName);

    } catch (error) {
        console.error('[LOGS] Error downloading file:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/v2/logs/:filename
 * Read log file contents
 * Query params:
 *   - lines: number of lines to return (default: 500, max: 5000)
 *   - offset: start from this line (for pagination)
 *   - filter: regex pattern to filter lines
 *   - level: filter by log level (error, warn, info)
 */
router.get('/:filename', requireAuth, async (req, res) => {
    try {
        const { filename } = req.params;
        const lines = Math.min(parseInt(req.query.lines) || 500, 5000);
        const offset = parseInt(req.query.offset) || 0;
        const filter = req.query.filter || '';
        const level = req.query.level || '';

        // Security: prevent directory traversal
        const safeName = path.basename(filename);
        if (!safeName.endsWith('.log')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid log file'
            });
        }

        const filePath = path.join(LOGS_DIR, safeName);

        if (!fs.existsSync(filePath)) {
            return res.json({
                success: true,
                filename: safeName,
                content: '',
                lines: [],
                totalLines: 0,
                message: 'Log file is empty or does not exist'
            });
        }

        // Read file content
        const content = fs.readFileSync(filePath, 'utf8');
        let allLines = content.split('\n').filter(line => line.trim());

        // Apply level filter
        if (level) {
            const levelPatterns = {
                'error': /\[error\]|error:|exception|uncaught/i,
                'warn': /\[warn\]|warning:|warn:/i,
                'info': /\[info\]|info:/i
            };

            if (levelPatterns[level]) {
                allLines = allLines.filter(line => levelPatterns[level].test(line));
            }
        }

        // Apply custom filter
        if (filter) {
            try {
                const regex = new RegExp(filter, 'i');
                allLines = allLines.filter(line => regex.test(line));
            } catch (e) {
                // Invalid regex, treat as plain text search
                allLines = allLines.filter(line =>
                    line.toLowerCase().includes(filter.toLowerCase())
                );
            }
        }

        const totalLines = allLines.length;

        // Get last N lines (most recent first for logs)
        const startIndex = Math.max(0, totalLines - lines - offset);
        const endIndex = totalLines - offset;
        const resultLines = allLines.slice(startIndex, endIndex);

        res.json({
            success: true,
            filename: safeName,
            lines: resultLines,
            totalLines: totalLines,
            showing: resultLines.length,
            offset: offset,
            hasMore: startIndex > 0
        });

    } catch (error) {
        console.error('[LOGS] Error reading file:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/v2/logs/:filename
 * Clear a log file
 */
router.delete('/:filename', requireAuth, async (req, res) => {
    try {
        const { filename } = req.params;

        // Security: prevent directory traversal
        const safeName = path.basename(filename);
        if (!safeName.endsWith('.log')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid log file'
            });
        }

        const filePath = path.join(LOGS_DIR, safeName);

        if (fs.existsSync(filePath)) {
            // Clear file contents instead of deleting (keeps file for future logging)
            fs.writeFileSync(filePath, '');
            console.log(`[LOGS] Cleared log file: ${safeName}`);
        }

        res.json({
            success: true,
            message: `Log file ${safeName} cleared successfully`
        });

    } catch (error) {
        console.error('[LOGS] Error clearing file:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Helper function to format bytes
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;
