/**
 * Seerr (Media Request Manager) API Routes
 *
 * Manages Seerr installation, process, and configuration
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { spawn, fork } = require('child_process');
const db = require('../database-config');

// Helper function that uses spawn instead of exec to avoid blocking event loop
// spawn streams output instead of buffering it all in memory
function spawnAsync(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            ...options
        });

        let stdout = '';
        let stderr = '';

        // Only capture last 1000 chars to avoid memory issues
        child.stdout.on('data', (data) => {
            const str = data.toString();
            stdout = (stdout + str).slice(-1000);
        });

        child.stderr.on('data', (data) => {
            const str = data.toString();
            stderr = (stderr + str).slice(-1000);
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}

// Paths
const SEERR_APP_DIR = process.env.SEERR_APP_DIR || '/app/seerr_app';
const SEERR_DATA_DIR = process.env.SEERR_DATA_DIR || '/app/data/seerr';
const SEERR_VERSION_FILE = path.join(SEERR_APP_DIR, 'seerr_version.json');
const SEERR_CONFIG_FILE = path.join(SEERR_DATA_DIR, 'settings.json');

// GitHub configuration for Seerr updates
const SEERR_GITHUB_REPO = 'seerr-team/seerr';
const GITHUB_API_BASE = 'https://api.github.com';

// Running process tracker
let seerrProcess = null;
let seerrStartTime = null;

// Installation state tracker (for background installs)
let installState = {
    inProgress: false,
    status: 'idle', // idle, downloading, extracting, installing_deps, building, complete, error
    message: '',
    version: null,
    error: null,
    startedAt: null
};

// ============================================================================
// VERSION & UPDATE ENDPOINTS
// ============================================================================

// GET /api/v2/seerr/version - Get installed Seerr version
router.get('/version', async (req, res) => {
    try {
        let versionInfo = {
            installed: false,
            version: null,
            installedAt: null,
            commit: null
        };

        if (fs.existsSync(SEERR_VERSION_FILE)) {
            const data = JSON.parse(fs.readFileSync(SEERR_VERSION_FILE, 'utf8'));
            versionInfo = {
                installed: true,
                ...data
            };
        }

        // Check if Seerr app directory exists with required files
        const packageJsonPath = path.join(SEERR_APP_DIR, 'package.json');
        versionInfo.appDirExists = fs.existsSync(SEERR_APP_DIR);
        versionInfo.hasPackageJson = fs.existsSync(packageJsonPath);
        versionInfo.dataDirExists = fs.existsSync(SEERR_DATA_DIR);

        res.json({
            success: true,
            ...versionInfo
        });
    } catch (error) {
        console.error('[Seerr] Error getting version:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get Seerr version',
            error: error.message
        });
    }
});

// GET /api/v2/seerr/check-update - Check for Seerr updates
router.get('/check-update', async (req, res) => {
    try {
        // Get latest release from GitHub
        const response = await fetch(
            `${GITHUB_API_BASE}/repos/${SEERR_GITHUB_REPO}/releases/latest`,
            {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Stream-Panel-Seerr-Updater'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const release = await response.json();
        const latestVersion = release.tag_name.replace(/^v/, '');

        // Get current installed version
        let currentVersion = null;
        if (fs.existsSync(SEERR_VERSION_FILE)) {
            const data = JSON.parse(fs.readFileSync(SEERR_VERSION_FILE, 'utf8'));
            currentVersion = data.version;
        }

        // Compare versions
        const updateAvailable = currentVersion !== latestVersion;

        res.json({
            success: true,
            currentVersion,
            latestVersion,
            updateAvailable,
            releaseUrl: release.html_url,
            releaseNotes: release.body?.substring(0, 500) || '',
            publishedAt: release.published_at
        });
    } catch (error) {
        console.error('[Seerr] Error checking for updates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check for Seerr updates',
            error: error.message
        });
    }
});

// GET /api/v2/seerr/install-status - Check installation progress
router.get('/install-status', (req, res) => {
    res.json({
        success: true,
        ...installState
    });
});

// Track the worker process
let installWorker = null;

// POST /api/v2/seerr/install - Install or update Seerr (runs in SEPARATE PROCESS)
router.post('/install', async (req, res) => {
    // Check if already installing
    if (installState.inProgress) {
        return res.status(409).json({
            success: false,
            message: 'Installation already in progress',
            status: installState.status
        });
    }

    const { version } = req.body;

    // Stop Seerr if running (before forking worker)
    if (seerrProcess) {
        console.log('[Seerr] Stopping running instance before update...');
        seerrProcess.kill('SIGTERM');
        seerrProcess = null;
        seerrStartTime = null;
    }

    // Mark as in progress
    installState = {
        inProgress: true,
        status: 'starting',
        message: 'Starting installation in separate process...',
        version: null,
        error: null,
        startedAt: Date.now()
    };

    // Fork a completely separate Node.js process for installation
    // This gives the worker its own event loop - won't block main app at all
    const workerPath = path.join(__dirname, '..', 'workers', 'seerr-install-worker.js');
    const args = version ? [version] : [];

    console.log('[Seerr] Forking installation worker process...');

    installWorker = fork(workerPath, args, {
        env: {
            ...process.env,
            SEERR_APP_DIR,
            SEERR_DATA_DIR
        },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    });

    // Handle messages from worker (status updates)
    installWorker.on('message', (msg) => {
        if (msg.type === 'status') {
            installState.status = msg.status;
            installState.message = msg.message;
            if (msg.version) installState.version = msg.version;
            if (msg.error) installState.error = msg.error;

            // Check if complete or error
            if (msg.status === 'complete' || msg.status === 'error') {
                installState.inProgress = false;
                installWorker = null;
            }

            console.log(`[Seerr] Worker status: ${msg.status} - ${msg.message}`);
        }
    });

    // Handle worker exit
    installWorker.on('exit', (code) => {
        console.log(`[Seerr] Installation worker exited with code ${code}`);

        // Always finalize state when worker exits
        if (installState.inProgress) {
            // Check if version file exists (worker may have succeeded even if IPC message was lost)
            if (fs.existsSync(SEERR_VERSION_FILE)) {
                try {
                    const versionData = JSON.parse(fs.readFileSync(SEERR_VERSION_FILE, 'utf8'));
                    installState.status = 'complete';
                    installState.message = `Seerr v${versionData.version} installed successfully!`;
                    installState.version = versionData.version;
                    console.log(`[Seerr] Installation verified complete via version file: v${versionData.version}`);
                } catch (e) {
                    installState.status = 'error';
                    installState.message = `Worker exited (code ${code}) - version file unreadable`;
                }
            } else if (code === 0) {
                // Exit 0 but no version file - something went wrong
                installState.status = 'error';
                installState.message = 'Worker exited successfully but version file not found';
            } else {
                installState.status = 'error';
                installState.message = `Installation worker exited unexpectedly (code ${code})`;
            }
            installState.inProgress = false;
        }
        installWorker = null;
    });

    // Handle worker errors
    installWorker.on('error', (err) => {
        console.error('[Seerr] Installation worker error:', err);
        installState.status = 'error';
        installState.message = `Worker error: ${err.message}`;
        installState.error = err.message;
        installState.inProgress = false;
        installWorker = null;
    });

    // Return immediately - worker runs completely independently
    res.json({
        success: true,
        message: 'Installation started in separate process',
        status: 'starting'
    });
})

// ============================================================================
// PROCESS MANAGEMENT ENDPOINTS
// ============================================================================

// GET /api/v2/seerr/status - Get Seerr process status
router.get('/status', async (req, res) => {
    try {
        const isRunning = seerrProcess !== null && !seerrProcess.killed;

        let status = {
            installed: fs.existsSync(SEERR_VERSION_FILE),
            running: isRunning,
            pid: isRunning ? seerrProcess.pid : null,
            startTime: seerrStartTime,
            uptime: seerrStartTime ? Math.round((Date.now() - seerrStartTime) / 1000) : null,
            port: 5055,
            url: 'http://localhost:5055'
        };

        // Check if Seerr is configured (has gone through initial setup)
        if (fs.existsSync(SEERR_CONFIG_FILE)) {
            try {
                const config = JSON.parse(fs.readFileSync(SEERR_CONFIG_FILE, 'utf8'));
                status.configured = true;
                status.initialized = config.initialized === true;
            } catch (e) {
                status.configured = false;
                status.initialized = false;
            }
        } else {
            status.configured = false;
            status.initialized = false;
        }

        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        console.error('[Seerr] Error getting status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get Seerr status',
            error: error.message
        });
    }
});

// POST /api/v2/seerr/start - Start Seerr process
router.post('/start', async (req, res) => {
    try {
        // Check if already running
        if (seerrProcess !== null && !seerrProcess.killed) {
            return res.status(409).json({
                success: false,
                message: 'Seerr is already running'
            });
        }

        // Check if Seerr is installed
        if (!fs.existsSync(SEERR_VERSION_FILE)) {
            return res.status(400).json({
                success: false,
                message: 'Seerr is not installed. Please install it first.'
            });
        }

        const packageJsonPath = path.join(SEERR_APP_DIR, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            return res.status(400).json({
                success: false,
                message: 'Seerr installation is incomplete. Please reinstall.'
            });
        }

        console.log('[Seerr] Starting Seerr...');

        // Create log file
        const logDir = path.join(SEERR_DATA_DIR, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, `seerr_${Date.now()}.log`);
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });

        // Start Seerr using pnpm
        seerrProcess = spawn('pnpm', ['start'], {
            cwd: SEERR_APP_DIR,
            env: {
                ...process.env,
                NODE_ENV: 'production',
                CONFIG_DIRECTORY: SEERR_DATA_DIR,
                PORT: '5055'
            }
        });

        seerrStartTime = Date.now();

        seerrProcess.stdout.on('data', (data) => {
            logStream.write(data);
            // Log to console for debugging
            console.log(`[Seerr stdout] ${data.toString().trim()}`);
        });

        seerrProcess.stderr.on('data', (data) => {
            logStream.write(data);
            console.error(`[Seerr stderr] ${data.toString().trim()}`);
        });

        seerrProcess.on('close', (code) => {
            logStream.end();
            console.log(`[Seerr] Process exited with code ${code}`);
            seerrProcess = null;
            seerrStartTime = null;
        });

        seerrProcess.on('error', (error) => {
            console.error('[Seerr] Process error:', error);
            logStream.write(`Process error: ${error.message}\n`);
            logStream.end();
            seerrProcess = null;
            seerrStartTime = null;
        });

        // Wait a moment for Seerr to start
        await new Promise(resolve => setTimeout(resolve, 2000));

        res.json({
            success: true,
            message: 'Seerr started successfully',
            pid: seerrProcess?.pid,
            port: 5055,
            url: 'http://localhost:5055'
        });
    } catch (error) {
        console.error('[Seerr] Error starting:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start Seerr',
            error: error.message
        });
    }
});

// POST /api/v2/seerr/stop - Stop Seerr process
router.post('/stop', async (req, res) => {
    try {
        if (seerrProcess === null || seerrProcess.killed) {
            return res.status(400).json({
                success: false,
                message: 'Seerr is not running'
            });
        }

        console.log('[Seerr] Stopping Seerr...');
        seerrProcess.kill('SIGTERM');

        // Wait for process to exit
        await new Promise(resolve => setTimeout(resolve, 1000));

        seerrProcess = null;
        seerrStartTime = null;

        res.json({
            success: true,
            message: 'Seerr stopped successfully'
        });
    } catch (error) {
        console.error('[Seerr] Error stopping:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop Seerr',
            error: error.message
        });
    }
});

// POST /api/v2/seerr/restart - Restart Seerr process
router.post('/restart', async (req, res) => {
    try {
        // Stop if running
        if (seerrProcess !== null && !seerrProcess.killed) {
            console.log('[Seerr] Stopping for restart...');
            seerrProcess.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 2000));
            seerrProcess = null;
            seerrStartTime = null;
        }

        // Start again
        console.log('[Seerr] Starting after restart...');

        const logDir = path.join(SEERR_DATA_DIR, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, `seerr_${Date.now()}.log`);
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });

        seerrProcess = spawn('pnpm', ['start'], {
            cwd: SEERR_APP_DIR,
            env: {
                ...process.env,
                NODE_ENV: 'production',
                CONFIG_DIRECTORY: SEERR_DATA_DIR,
                PORT: '5055'
            }
        });

        seerrStartTime = Date.now();

        seerrProcess.stdout.on('data', (data) => {
            logStream.write(data);
        });

        seerrProcess.stderr.on('data', (data) => {
            logStream.write(data);
        });

        seerrProcess.on('close', (code) => {
            logStream.end();
            seerrProcess = null;
            seerrStartTime = null;
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        res.json({
            success: true,
            message: 'Seerr restarted successfully',
            pid: seerrProcess?.pid
        });
    } catch (error) {
        console.error('[Seerr] Error restarting:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to restart Seerr',
            error: error.message
        });
    }
});

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

// GET /api/v2/seerr/settings - Get Seerr enabled/disabled setting
router.get('/settings', async (req, res) => {
    try {
        // Get from database
        const result = await db.query(`
            SELECT setting_value FROM settings WHERE setting_key = 'seerr_enabled'
        `);

        const enabled = result.length > 0 && result[0].setting_value === 'true';

        res.json({
            success: true,
            enabled,
            autoStart: enabled // If enabled, it should auto-start
        });
    } catch (error) {
        console.error('[Seerr] Error getting settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get Seerr settings',
            error: error.message
        });
    }
});

// PUT /api/v2/seerr/settings - Update Seerr settings
router.put('/settings', async (req, res) => {
    try {
        const { enabled } = req.body;

        // Check if setting exists
        const existing = await db.query(`
            SELECT id FROM settings WHERE setting_key = 'seerr_enabled'
        `);

        if (existing.length > 0) {
            await db.run(`
                UPDATE settings SET setting_value = ?, updated_at = datetime('now')
                WHERE setting_key = 'seerr_enabled'
            `, [enabled ? 'true' : 'false']);
        } else {
            await db.run(`
                INSERT INTO settings (setting_key, setting_value, created_at, updated_at)
                VALUES ('seerr_enabled', ?, datetime('now'), datetime('now'))
            `, [enabled ? 'true' : 'false']);
        }

        // If enabling, start Seerr; if disabling, stop it
        if (enabled) {
            if (!seerrProcess || seerrProcess.killed) {
                // Auto-start Seerr
                if (fs.existsSync(SEERR_VERSION_FILE)) {
                    console.log('[Seerr] Auto-starting due to enable...');

                    const logDir = path.join(SEERR_DATA_DIR, 'logs');
                    if (!fs.existsSync(logDir)) {
                        fs.mkdirSync(logDir, { recursive: true });
                    }
                    const logFile = path.join(logDir, `seerr_${Date.now()}.log`);
                    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

                    seerrProcess = spawn('pnpm', ['start'], {
                        cwd: SEERR_APP_DIR,
                        env: {
                            ...process.env,
                            NODE_ENV: 'production',
                            CONFIG_DIRECTORY: SEERR_DATA_DIR,
                            PORT: '5055'
                        }
                    });

                    seerrStartTime = Date.now();

                    seerrProcess.stdout.on('data', (data) => logStream.write(data));
                    seerrProcess.stderr.on('data', (data) => logStream.write(data));
                    seerrProcess.on('close', () => {
                        logStream.end();
                        seerrProcess = null;
                        seerrStartTime = null;
                    });
                }
            }
        } else {
            // Stop Seerr if running
            if (seerrProcess && !seerrProcess.killed) {
                console.log('[Seerr] Stopping due to disable...');
                seerrProcess.kill('SIGTERM');
                seerrProcess = null;
                seerrStartTime = null;
            }
        }

        res.json({
            success: true,
            message: enabled ? 'Seerr enabled' : 'Seerr disabled',
            enabled
        });
    } catch (error) {
        console.error('[Seerr] Error updating settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update Seerr settings',
            error: error.message
        });
    }
});

// ============================================================================
// LOGS
// ============================================================================

// GET /api/v2/seerr/logs - List Seerr log files
router.get('/logs', async (req, res) => {
    try {
        const logsDir = path.join(SEERR_DATA_DIR, 'logs');

        if (!fs.existsSync(logsDir)) {
            return res.json({
                success: true,
                logs: []
            });
        }

        const files = fs.readdirSync(logsDir)
            .filter(f => f.endsWith('.log'))
            .map(f => {
                const filePath = path.join(logsDir, f);
                const stats = fs.statSync(filePath);
                return {
                    name: f,
                    size: stats.size,
                    modified: stats.mtime
                };
            })
            .sort((a, b) => new Date(b.modified) - new Date(a.modified));

        res.json({
            success: true,
            logs: files
        });
    } catch (error) {
        console.error('[Seerr] Error listing logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list logs',
            error: error.message
        });
    }
});

// GET /api/v2/seerr/logs/:logfile - Read specific log file
router.get('/logs/:logfile', async (req, res) => {
    try {
        const { logfile } = req.params;
        const { tail } = req.query;
        const logPath = path.join(SEERR_DATA_DIR, 'logs', logfile);

        // Security check
        if (!logPath.startsWith(path.join(SEERR_DATA_DIR, 'logs'))) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (!fs.existsSync(logPath)) {
            return res.status(404).json({
                success: false,
                message: 'Log file not found'
            });
        }

        let content = fs.readFileSync(logPath, 'utf8');

        // If tail is specified, only return last N lines
        if (tail) {
            const lines = content.split('\n');
            const tailLines = parseInt(tail) || 100;
            content = lines.slice(-tailLines).join('\n');
        }

        res.json({
            success: true,
            logfile,
            content
        });
    } catch (error) {
        console.error('[Seerr] Error reading log:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to read log file',
            error: error.message
        });
    }
});

// ============================================================================
// AUTO-START FUNCTION (called from app.js on startup)
// ============================================================================

async function autoStartSeerr() {
    try {
        // Check if Seerr is enabled in settings
        const result = await db.query(`
            SELECT setting_value FROM settings WHERE setting_key = 'seerr_enabled'
        `);

        const enabled = result.length > 0 && result[0].setting_value === 'true';

        if (!enabled) {
            console.log('[Seerr] Auto-start skipped (not enabled)');
            return;
        }

        // Check if Seerr is installed
        if (!fs.existsSync(SEERR_VERSION_FILE)) {
            console.log('[Seerr] Auto-start skipped (not installed)');
            return;
        }

        console.log('[Seerr] Auto-starting...');

        const logDir = path.join(SEERR_DATA_DIR, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, `seerr_${Date.now()}.log`);
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });

        seerrProcess = spawn('pnpm', ['start'], {
            cwd: SEERR_APP_DIR,
            env: {
                ...process.env,
                NODE_ENV: 'production',
                CONFIG_DIRECTORY: SEERR_DATA_DIR,
                PORT: '5055'
            }
        });

        seerrStartTime = Date.now();

        seerrProcess.stdout.on('data', (data) => logStream.write(data));
        seerrProcess.stderr.on('data', (data) => logStream.write(data));
        seerrProcess.on('close', (code) => {
            logStream.end();
            console.log(`[Seerr] Process exited with code ${code}`);
            seerrProcess = null;
            seerrStartTime = null;
        });

        console.log('[Seerr] Started successfully');
    } catch (error) {
        console.error('[Seerr] Auto-start failed:', error);
    }
}

// Export router and auto-start function
module.exports = router;
module.exports.autoStartSeerr = autoStartSeerr;
