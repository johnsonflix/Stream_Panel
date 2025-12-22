/**
 * Kometa (Plex Meta Manager) API Routes
 *
 * Manages Kometa instances, configuration, and execution
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const db = require('../database-config');
const multer = require('multer');

/**
 * Download a file using Node.js https (no external dependencies like curl)
 * Follows redirects automatically
 */
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);

        const request = https.get(url, (response) => {
            // Handle redirects (GitHub uses 302 redirects)
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(destPath); // Remove empty file
                return downloadFile(response.headers.location, destPath)
                    .then(resolve)
                    .catch(reject);
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(destPath);
                return reject(new Error(`Download failed with status ${response.statusCode}`));
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });
        });

        request.on('error', (err) => {
            file.close();
            fs.unlink(destPath, () => {}); // Delete partial file
            reject(err);
        });

        file.on('error', (err) => {
            file.close();
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

// Configure multer for asset uploads
const assetStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const instanceId = req.params.id;
        const assetsDir = path.join(KOMETA_DATA_DIR, instanceId, 'config', 'assets');
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir, { recursive: true });
        }
        cb(null, assetsDir);
    },
    filename: (req, file, cb) => {
        // Keep original filename but sanitize it
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, safeName);
    }
});
const assetUpload = multer({
    storage: assetStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PNG, JPEG, GIF, and WebP images are allowed'));
        }
    }
});

// Paths
const KOMETA_APP_DIR = path.join(__dirname, '../../kometa_app');
const KOMETA_DATA_DIR = process.env.KOMETA_DATA_DIR || '/app/data/kometa';
// Version file stored in kometa_app directory so it persists across container rebuilds
const KOMETA_VERSION_FILE = path.join(KOMETA_APP_DIR, 'kometa_version.json');

// GitHub configuration for Kometa updates
const KOMETA_GITHUB_REPO = 'Kometa-Team/Kometa';
const GITHUB_API_BASE = 'https://api.github.com';

// Running processes tracker
const runningProcesses = new Map();

// ============================================================================
// VERSION & UPDATE ENDPOINTS
// ============================================================================

// GET /api/v2/kometa/version - Get installed Kometa version
router.get('/version', async (req, res) => {
    try {
        let versionInfo = {
            installed: false,
            version: null,
            installedAt: null,
            commit: null
        };

        if (fs.existsSync(KOMETA_VERSION_FILE)) {
            const data = JSON.parse(fs.readFileSync(KOMETA_VERSION_FILE, 'utf8'));
            versionInfo = {
                installed: true,
                ...data
            };
        }

        // Check if Kometa app directory exists
        versionInfo.appDirExists = fs.existsSync(KOMETA_APP_DIR);
        versionInfo.dataDirExists = fs.existsSync(KOMETA_DATA_DIR);

        res.json({
            success: true,
            ...versionInfo
        });
    } catch (error) {
        console.error('[Kometa] Error getting version:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get Kometa version',
            error: error.message
        });
    }
});

// GET /api/v2/kometa/check-update - Check for Kometa updates
router.get('/check-update', async (req, res) => {
    try {
        // Get latest release from GitHub
        const response = await fetch(
            `${GITHUB_API_BASE}/repos/${KOMETA_GITHUB_REPO}/releases/latest`,
            {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Stream-Panel-Kometa-Updater'
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
        if (fs.existsSync(KOMETA_VERSION_FILE)) {
            const data = JSON.parse(fs.readFileSync(KOMETA_VERSION_FILE, 'utf8'));
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
        console.error('[Kometa] Error checking for updates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check for Kometa updates',
            error: error.message
        });
    }
});

// POST /api/v2/kometa/install - Install or update Kometa
router.post('/install', async (req, res) => {
    try {
        const { version } = req.body; // Optional specific version, defaults to latest

        console.log('[Kometa] Starting installation...');

        // Get the version to install
        let targetVersion = version;
        let releaseData;

        if (!targetVersion) {
            // Get latest release
            const response = await fetch(
                `${GITHUB_API_BASE}/repos/${KOMETA_GITHUB_REPO}/releases/latest`,
                {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Stream-Panel-Kometa-Updater'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            releaseData = await response.json();
            targetVersion = releaseData.tag_name.replace(/^v/, '');
        }

        console.log(`[Kometa] Installing version ${targetVersion}...`);

        // Create app directory if it doesn't exist
        if (!fs.existsSync(KOMETA_APP_DIR)) {
            fs.mkdirSync(KOMETA_APP_DIR, { recursive: true });
        }

        // Download and extract Kometa
        const downloadUrl = `https://github.com/${KOMETA_GITHUB_REPO}/archive/refs/tags/v${targetVersion}.zip`;
        const zipPath = path.join(KOMETA_APP_DIR, 'kometa.zip');

        // Download using Node.js https (works without curl)
        console.log(`[Kometa] Downloading from ${downloadUrl}...`);
        await downloadFile(downloadUrl, zipPath);

        // Extract
        await execPromise(`unzip -o "${zipPath}" -d "${KOMETA_APP_DIR}"`);

        // Move contents from extracted folder to app dir
        const extractedDir = path.join(KOMETA_APP_DIR, `Kometa-${targetVersion}`);
        if (fs.existsSync(extractedDir)) {
            // Copy all files from extracted dir to app dir
            await execPromise(`cp -r "${extractedDir}"/* "${KOMETA_APP_DIR}/"`);
            // Remove extracted dir and zip
            await execPromise(`rm -rf "${extractedDir}" "${zipPath}"`);
        }

        // Install Python dependencies
        console.log('[Kometa] Installing Python dependencies...');
        const requirementsPath = path.join(KOMETA_APP_DIR, 'requirements.txt');
        if (fs.existsSync(requirementsPath)) {
            await execPromise(`pip3 install --break-system-packages -r "${requirementsPath}"`);
        }

        // Save version info
        const versionInfo = {
            version: targetVersion,
            installedFrom: KOMETA_GITHUB_REPO,
            installedAt: new Date().toISOString(),
            commit: releaseData?.target_commitish || null
        };
        fs.writeFileSync(KOMETA_VERSION_FILE, JSON.stringify(versionInfo, null, 2));

        console.log(`[Kometa] Successfully installed version ${targetVersion}`);

        res.json({
            success: true,
            message: `Kometa ${targetVersion} installed successfully`,
            version: targetVersion
        });
    } catch (error) {
        console.error('[Kometa] Installation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to install Kometa',
            error: error.message
        });
    }
});

// ============================================================================
// INSTANCE MANAGEMENT ENDPOINTS
// ============================================================================

// GET /api/v2/kometa/instances - List all Kometa instances
router.get('/instances', async (req, res) => {
    try {
        // Ensure data directory exists
        if (!fs.existsSync(KOMETA_DATA_DIR)) {
            fs.mkdirSync(KOMETA_DATA_DIR, { recursive: true });
        }

        // Read instances from data directory
        const entries = fs.readdirSync(KOMETA_DATA_DIR, { withFileTypes: true });
        const instances = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const instanceDir = path.join(KOMETA_DATA_DIR, entry.name);
                const configPath = path.join(instanceDir, 'config.yml');
                const metaPath = path.join(instanceDir, 'instance.json');

                const instance = {
                    id: entry.name,
                    name: entry.name,
                    configExists: fs.existsSync(configPath),
                    hasConfig: fs.existsSync(configPath),
                    isRunning: runningProcesses.has(entry.name),
                    lastRun: null,
                    schedule: null
                };

                // Read instance metadata if exists
                if (fs.existsSync(metaPath)) {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    instance.name = meta.name || entry.name;
                    instance.lastRun = meta.lastRun || null;
                    instance.schedule = meta.schedule || null;
                    instance.plexServers = meta.plexServers || [];
                }

                instances.push(instance);
            }
        }

        res.json({
            success: true,
            instances,
            count: instances.length
        });
    } catch (error) {
        console.error('[Kometa] Error listing instances:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list Kometa instances',
            error: error.message
        });
    }
});

// POST /api/v2/kometa/instances - Create new instance
router.post('/instances', async (req, res) => {
    try {
        const { name, plexServerIds, autoDetect } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Instance name is required'
            });
        }

        // Sanitize name for directory
        const instanceId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const instanceDir = path.join(KOMETA_DATA_DIR, instanceId);

        if (fs.existsSync(instanceDir)) {
            return res.status(409).json({
                success: false,
                message: 'An instance with this name already exists'
            });
        }

        // Create instance directory structure
        fs.mkdirSync(instanceDir, { recursive: true });
        fs.mkdirSync(path.join(instanceDir, 'config'), { recursive: true });
        fs.mkdirSync(path.join(instanceDir, 'logs'), { recursive: true });
        fs.mkdirSync(path.join(instanceDir, 'assets'), { recursive: true });

        // Get Plex server details if auto-detecting
        let plexServers = [];
        if (autoDetect || (plexServerIds && plexServerIds.length > 0)) {
            const serverIds = plexServerIds || [];

            let query = `
                SELECT id, name, url, token, server_id
                FROM plex_servers
                WHERE is_active = 1
            `;

            if (serverIds.length > 0) {
                query += ` AND id IN (${serverIds.join(',')})`;
            }

            plexServers = await db.query(query);
        }

        // Generate initial config.yml
        const configContent = generateKometaConfig(plexServers);
        fs.writeFileSync(path.join(instanceDir, 'config.yml'), configContent);

        // Save instance metadata
        const metadata = {
            name,
            createdAt: new Date().toISOString(),
            plexServers: plexServers.map(s => ({ id: s.id, name: s.name })),
            schedule: null,
            lastRun: null
        };
        fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(metadata, null, 2));

        console.log(`[Kometa] Created instance: ${instanceId}`);

        res.status(201).json({
            success: true,
            message: 'Kometa instance created successfully',
            instance: {
                id: instanceId,
                name,
                configPath: path.join(instanceDir, 'config.yml'),
                plexServers: metadata.plexServers
            }
        });
    } catch (error) {
        console.error('[Kometa] Error creating instance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create Kometa instance',
            error: error.message
        });
    }
});

// GET /api/v2/kometa/instances/:id - Get instance details
router.get('/instances/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);

        if (!fs.existsSync(instanceDir)) {
            return res.status(404).json({
                success: false,
                message: 'Kometa instance not found'
            });
        }

        const metaPath = path.join(instanceDir, 'instance.json');
        let metadata = { name: id };
        if (fs.existsSync(metaPath)) {
            metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        }

        // Get config file content
        const configPath = path.join(instanceDir, 'config.yml');
        let configContent = '';
        if (fs.existsSync(configPath)) {
            configContent = fs.readFileSync(configPath, 'utf8');
        }

        // List config files in config directory
        const configDir = path.join(instanceDir, 'config');
        let configFiles = [];
        if (fs.existsSync(configDir)) {
            configFiles = fs.readdirSync(configDir)
                .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
                .map(f => ({
                    name: f,
                    path: path.join('config', f)
                }));
        }

        res.json({
            success: true,
            instance: {
                id,
                ...metadata,
                isRunning: runningProcesses.has(id),
                configContent,
                configFiles
            }
        });
    } catch (error) {
        console.error('[Kometa] Error getting instance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get Kometa instance',
            error: error.message
        });
    }
});

// PUT /api/v2/kometa/instances/:id - Update instance
router.put('/instances/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, schedule } = req.body;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);

        if (!fs.existsSync(instanceDir)) {
            return res.status(404).json({
                success: false,
                message: 'Kometa instance not found'
            });
        }

        const metaPath = path.join(instanceDir, 'instance.json');
        let metadata = { name: id };
        if (fs.existsSync(metaPath)) {
            metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        }

        if (name) metadata.name = name;
        if (schedule !== undefined) metadata.schedule = schedule;
        metadata.updatedAt = new Date().toISOString();

        fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

        res.json({
            success: true,
            message: 'Instance updated successfully',
            instance: { id, ...metadata }
        });
    } catch (error) {
        console.error('[Kometa] Error updating instance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update Kometa instance',
            error: error.message
        });
    }
});

// DELETE /api/v2/kometa/instances/:id - Delete instance
router.delete('/instances/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);

        if (!fs.existsSync(instanceDir)) {
            return res.status(404).json({
                success: false,
                message: 'Kometa instance not found'
            });
        }

        // Stop if running
        if (runningProcesses.has(id)) {
            const proc = runningProcesses.get(id);
            proc.kill();
            runningProcesses.delete(id);
        }

        // Remove directory
        fs.rmSync(instanceDir, { recursive: true, force: true });

        console.log(`[Kometa] Deleted instance: ${id}`);

        res.json({
            success: true,
            message: 'Kometa instance deleted successfully'
        });
    } catch (error) {
        console.error('[Kometa] Error deleting instance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete Kometa instance',
            error: error.message
        });
    }
});

// ============================================================================
// FILE MANAGEMENT ENDPOINTS
// ============================================================================

// GET /api/v2/kometa/instances/:id/files - List files in instance
router.get('/instances/:id/files', async (req, res) => {
    try {
        const { id } = req.params;
        const { subpath } = req.query;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);

        if (!fs.existsSync(instanceDir)) {
            return res.status(404).json({
                success: false,
                message: 'Kometa instance not found'
            });
        }

        const targetDir = subpath ? path.join(instanceDir, subpath) : instanceDir;

        // Security check - ensure we're still within instance directory
        if (!targetDir.startsWith(instanceDir)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (!fs.existsSync(targetDir)) {
            return res.status(404).json({
                success: false,
                message: 'Directory not found'
            });
        }

        const entries = fs.readdirSync(targetDir, { withFileTypes: true });
        const files = entries.map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            path: subpath ? path.join(subpath, entry.name) : entry.name,
            extension: entry.isFile() ? path.extname(entry.name) : null
        }));

        // Sort: directories first, then files, alphabetically
        files.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        res.json({
            success: true,
            currentPath: subpath || '',
            files
        });
    } catch (error) {
        console.error('[Kometa] Error listing files:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list files',
            error: error.message
        });
    }
});

// GET /api/v2/kometa/instances/:id/file - Read file content
router.get('/instances/:id/file', async (req, res) => {
    try {
        const { id } = req.params;
        const { filepath } = req.query;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);

        if (!filepath) {
            return res.status(400).json({
                success: false,
                message: 'filepath query parameter is required'
            });
        }

        const filePath = path.join(instanceDir, filepath);

        // Security check
        if (!filePath.startsWith(instanceDir)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const stats = fs.statSync(filePath);

        res.json({
            success: true,
            filepath,
            content,
            size: stats.size,
            modified: stats.mtime
        });
    } catch (error) {
        console.error('[Kometa] Error reading file:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to read file',
            error: error.message
        });
    }
});

// PUT /api/v2/kometa/instances/:id/file - Save file content
router.put('/instances/:id/file', async (req, res) => {
    try {
        const { id } = req.params;
        const { filepath, content } = req.body;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);

        if (!filepath || content === undefined) {
            return res.status(400).json({
                success: false,
                message: 'filepath and content are required'
            });
        }

        const filePath = path.join(instanceDir, filepath);

        // Security check
        if (!filePath.startsWith(instanceDir)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, content, 'utf8');

        console.log(`[Kometa] Saved file: ${filepath}`);

        res.json({
            success: true,
            message: 'File saved successfully',
            filepath
        });
    } catch (error) {
        console.error('[Kometa] Error saving file:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save file',
            error: error.message
        });
    }
});

// POST /api/v2/kometa/instances/:id/file - Create new file
router.post('/instances/:id/file', async (req, res) => {
    try {
        const { id } = req.params;
        const { filepath, content, isDirectory } = req.body;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);

        if (!filepath) {
            return res.status(400).json({
                success: false,
                message: 'filepath is required'
            });
        }

        const targetPath = path.join(instanceDir, filepath);

        // Security check
        if (!targetPath.startsWith(instanceDir)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (fs.existsSync(targetPath)) {
            return res.status(409).json({
                success: false,
                message: 'File or directory already exists'
            });
        }

        if (isDirectory) {
            fs.mkdirSync(targetPath, { recursive: true });
        } else {
            // Ensure parent directory exists
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(targetPath, content || '', 'utf8');
        }

        res.status(201).json({
            success: true,
            message: isDirectory ? 'Directory created' : 'File created',
            filepath
        });
    } catch (error) {
        console.error('[Kometa] Error creating file:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create file',
            error: error.message
        });
    }
});

// DELETE /api/v2/kometa/instances/:id/file - Delete file
router.delete('/instances/:id/file', async (req, res) => {
    try {
        const { id } = req.params;
        const { filepath } = req.body;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);

        if (!filepath) {
            return res.status(400).json({
                success: false,
                message: 'filepath is required'
            });
        }

        // Prevent deletion of critical files
        const protectedFiles = ['config.yml', 'instance.json'];
        if (protectedFiles.includes(filepath)) {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete protected file'
            });
        }

        const targetPath = path.join(instanceDir, filepath);

        // Security check
        if (!targetPath.startsWith(instanceDir)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        const stats = fs.statSync(targetPath);
        if (stats.isDirectory()) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(targetPath);
        }

        res.json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        console.error('[Kometa] Error deleting file:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete file',
            error: error.message
        });
    }
});

// ============================================================================
// RUN & LOG ENDPOINTS
// ============================================================================

// POST /api/v2/kometa/instances/:id/run - Run Kometa for instance
router.post('/instances/:id/run', async (req, res) => {
    try {
        const { id } = req.params;
        const { dryRun, libraries } = req.body;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);

        if (!fs.existsSync(instanceDir)) {
            return res.status(404).json({
                success: false,
                message: 'Kometa instance not found'
            });
        }

        if (runningProcesses.has(id)) {
            return res.status(409).json({
                success: false,
                message: 'Kometa is already running for this instance'
            });
        }

        // Check if Kometa is installed
        const kometaScript = path.join(KOMETA_APP_DIR, 'kometa.py');
        if (!fs.existsSync(kometaScript)) {
            return res.status(400).json({
                success: false,
                message: 'Kometa is not installed. Please install it first.'
            });
        }

        const configPath = path.join(instanceDir, 'config.yml');
        if (!fs.existsSync(configPath)) {
            return res.status(400).json({
                success: false,
                message: 'config.yml not found for this instance'
            });
        }

        // Build command arguments
        // --run flag is required to run immediately instead of waiting for scheduled time
        const args = [kometaScript, '--config', configPath, '--run'];
        if (dryRun) args.push('--run-tests');
        if (libraries && libraries.length > 0) {
            args.push('--libraries', libraries.join(','));
        }

        // Create log file
        const logFile = path.join(instanceDir, 'logs', `run_${Date.now()}.log`);
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });

        console.log(`[Kometa] Starting instance ${id}: python3 ${args.join(' ')}`);

        // Spawn process
        const proc = spawn('python3', args, {
            cwd: instanceDir,
            env: { ...process.env, KOMETA_CONFIG: configPath }
        });

        runningProcesses.set(id, { process: proc, logFile, startTime: Date.now() });

        proc.stdout.on('data', (data) => {
            logStream.write(data);
        });

        proc.stderr.on('data', (data) => {
            logStream.write(data);
        });

        proc.on('close', (code) => {
            logStream.end();
            runningProcesses.delete(id);

            // Update instance metadata
            const metaPath = path.join(instanceDir, 'instance.json');
            if (fs.existsSync(metaPath)) {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                meta.lastRun = new Date().toISOString();
                meta.lastRunExitCode = code;
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
            }

            console.log(`[Kometa] Instance ${id} finished with exit code ${code}`);
        });

        res.json({
            success: true,
            message: 'Kometa started successfully',
            logFile: path.relative(instanceDir, logFile)
        });
    } catch (error) {
        console.error('[Kometa] Error running instance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to run Kometa',
            error: error.message
        });
    }
});

// POST /api/v2/kometa/instances/:id/stop - Stop running Kometa
router.post('/instances/:id/stop', async (req, res) => {
    try {
        const { id } = req.params;

        if (!runningProcesses.has(id)) {
            return res.status(400).json({
                success: false,
                message: 'Kometa is not running for this instance'
            });
        }

        const { process: proc } = runningProcesses.get(id);
        proc.kill('SIGTERM');
        runningProcesses.delete(id);

        console.log(`[Kometa] Stopped instance ${id}`);

        res.json({
            success: true,
            message: 'Kometa stopped successfully'
        });
    } catch (error) {
        console.error('[Kometa] Error stopping instance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop Kometa',
            error: error.message
        });
    }
});

// GET /api/v2/kometa/instances/:id/status - Get run status
router.get('/instances/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);

        if (!fs.existsSync(instanceDir)) {
            return res.status(404).json({
                success: false,
                message: 'Kometa instance not found'
            });
        }

        const isRunning = runningProcesses.has(id);
        let runningInfo = null;

        if (isRunning) {
            const { logFile, startTime } = runningProcesses.get(id);
            runningInfo = {
                logFile: path.relative(instanceDir, logFile),
                startTime,
                runningFor: Math.round((Date.now() - startTime) / 1000)
            };
        }

        res.json({
            success: true,
            isRunning,
            runningInfo
        });
    } catch (error) {
        console.error('[Kometa] Error getting status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get status',
            error: error.message
        });
    }
});

// GET /api/v2/kometa/instances/:id/live-log - Get live log output (for running instance)
router.get('/instances/:id/live-log', async (req, res) => {
    try {
        const { id } = req.params;
        const { offset } = req.query; // Byte offset to read from
        const instanceDir = path.join(KOMETA_DATA_DIR, id);

        if (!fs.existsSync(instanceDir)) {
            return res.status(404).json({
                success: false,
                message: 'Kometa instance not found'
            });
        }

        const isRunning = runningProcesses.has(id);

        if (!isRunning) {
            return res.json({
                success: true,
                isRunning: false,
                content: '',
                offset: 0,
                message: 'Kometa is not currently running'
            });
        }

        const { logFile } = runningProcesses.get(id);

        if (!fs.existsSync(logFile)) {
            return res.json({
                success: true,
                isRunning: true,
                content: '',
                offset: 0
            });
        }

        const stats = fs.statSync(logFile);
        const startOffset = parseInt(offset) || 0;

        // Read from offset to end of file
        let content = '';
        if (stats.size > startOffset) {
            const fd = fs.openSync(logFile, 'r');
            const buffer = Buffer.alloc(stats.size - startOffset);
            fs.readSync(fd, buffer, 0, buffer.length, startOffset);
            fs.closeSync(fd);
            content = buffer.toString('utf8');
        }

        res.json({
            success: true,
            isRunning: true,
            content,
            offset: stats.size,
            fileSize: stats.size
        });
    } catch (error) {
        console.error('[Kometa] Error reading live log:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to read live log',
            error: error.message
        });
    }
});

// GET /api/v2/kometa/instances/:id/logs - List log files
router.get('/instances/:id/logs', async (req, res) => {
    try {
        const { id } = req.params;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);
        const logsDir = path.join(instanceDir, 'logs');

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
        console.error('[Kometa] Error listing logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list logs',
            error: error.message
        });
    }
});

// GET /api/v2/kometa/instances/:id/logs/:logfile - Read log file
router.get('/instances/:id/logs/:logfile', async (req, res) => {
    try {
        const { id, logfile } = req.params;
        const { tail } = req.query; // Optional: only get last N lines
        const instanceDir = path.join(KOMETA_DATA_DIR, id);
        const logPath = path.join(instanceDir, 'logs', logfile);

        // Security check
        if (!logPath.startsWith(path.join(instanceDir, 'logs'))) {
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
        console.error('[Kometa] Error reading log:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to read log file',
            error: error.message
        });
    }
});

// ============================================================================
// PLEX SERVER INTEGRATION
// ============================================================================

// GET /api/v2/kometa/plex-servers - Get available Plex servers for config
router.get('/plex-servers', async (req, res) => {
    try {
        const servers = await db.query(`
            SELECT id, name, url, token, server_id, libraries
            FROM plex_servers
            WHERE is_active = 1
            ORDER BY name
        `);

        res.json({
            success: true,
            servers: servers.map(s => ({
                id: s.id,
                name: s.name,
                url: s.url,
                token: s.token || '',  // Include actual token for config form
                libraries: s.libraries ? JSON.parse(s.libraries) : []
            }))
        });
    } catch (error) {
        console.error('[Kometa] Error getting Plex servers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get Plex servers',
            error: error.message
        });
    }
});

// GET /api/v2/kometa/instances/:id/config - Get parsed config for editing
router.get('/instances/:id/config', async (req, res) => {
    try {
        const { id } = req.params;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);
        const configPath = path.join(instanceDir, 'config.yml');
        const metaPath = path.join(instanceDir, 'instance.json');

        if (!fs.existsSync(instanceDir)) {
            return res.status(404).json({
                success: false,
                message: 'Kometa instance not found'
            });
        }

        // Read instance metadata
        let metadata = {};
        if (fs.existsSync(metaPath)) {
            metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        }

        // Parse config if it exists
        let configData = {
            tmdb_apikey: '',
            omdb_apikey: '',
            libraries: [],
            settings: {
                sync_mode: 'append',
                cache: true,
                cache_expiration: 60,
                minimum_items: 1,
                run_again_delay: 2,
                item_refresh_delay: 0,
                tvdb_language: 'eng',
                asset_folders: true,
                delete_below_minimum: true,
                delete_not_scheduled: false,
                missing_only_released: false,
                show_unmanaged: true,
                show_filtered: false,
                show_missing: false,
                save_missing: true,
                only_filter_missing: false,
                show_options: false,
                verify_ssl: true,
                overlay_artwork_filetype: 'jpg',
                overlay_artwork_quality: null,
                playlist_sync_to_users: 'all'
            },
            trakt: { enabled: false, client_id: '', client_secret: '', authorization_yaml: '' },
            tautulli: { enabled: false, url: '', apikey: '' },
            radarr: { enabled: false, url: '', apikey: '', root_folder: '/movies', quality_profile: 'HD-1080p' },
            sonarr: { enabled: false, url: '', apikey: '', root_folder: '/tv', quality_profile: 'HD-1080p' }
        };

        if (fs.existsSync(configPath)) {
            const yaml = require('js-yaml');
            try {
                const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) || {};

                // Extract TMDb API key
                if (raw.tmdb && raw.tmdb.apikey && !raw.tmdb.apikey.toString().startsWith('#')) {
                    configData.tmdb_apikey = raw.tmdb.apikey;
                }

                // Extract OMDb API key
                if (raw.omdb && raw.omdb.apikey && !raw.omdb.apikey.toString().startsWith('#')) {
                    configData.omdb_apikey = raw.omdb.apikey;
                }

                // Extract libraries
                if (raw.libraries) {
                    configData.libraries = Object.entries(raw.libraries).map(([name, lib]) => ({
                        name,
                        collection_files: lib?.collection_files || [],
                        overlay_files: lib?.overlay_files || [],
                        operations: lib?.operations || {}
                    }));
                }

                // Extract settings
                if (raw.settings) {
                    configData.settings = { ...configData.settings, ...raw.settings };
                }

                // Extract Trakt
                if (raw.trakt && raw.trakt.client_id) {
                    // Convert authorization object to YAML text for display in textarea
                    let authYaml = '';
                    if (raw.trakt.authorization) {
                        const auth = raw.trakt.authorization;
                        authYaml = `access_token: ${auth.access_token || ''}\ntoken_type: ${auth.token_type || 'Bearer'}\nexpires_in: ${auth.expires_in || ''}\nrefresh_token: ${auth.refresh_token || ''}\nscope: ${auth.scope || 'public'}\ncreated_at: ${auth.created_at || ''}`;
                    }
                    configData.trakt = {
                        enabled: true,
                        client_id: raw.trakt.client_id,
                        client_secret: raw.trakt.client_secret || '',
                        authorization_yaml: authYaml
                    };
                }

                // Extract optional integrations
                if (raw.tautulli) {
                    configData.tautulli = { enabled: true, ...raw.tautulli };
                }
                if (raw.radarr) {
                    configData.radarr = { enabled: true, ...raw.radarr };
                }
                if (raw.sonarr) {
                    configData.sonarr = { enabled: true, ...raw.sonarr };
                }
            } catch (e) {
                console.log('[Kometa] Could not parse existing config:', e.message);
            }
        }

        // Include collections and overlays from metadata (stored in instance.json)
        configData.collections = metadata.collections || [];
        configData.overlays = metadata.overlays || [];

        res.json({
            success: true,
            instance: { id, ...metadata },
            config: configData
        });
    } catch (error) {
        console.error('[Kometa] Error getting config:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get config',
            error: error.message
        });
    }
});

// PUT /api/v2/kometa/instances/:id/config - Update config from form data
router.put('/instances/:id/config', async (req, res) => {
    try {
        const { id } = req.params;
        const { config } = req.body;
        const instanceDir = path.join(KOMETA_DATA_DIR, id);
        const configPath = path.join(instanceDir, 'config.yml');
        const metaPath = path.join(instanceDir, 'instance.json');

        if (!fs.existsSync(instanceDir)) {
            return res.status(404).json({
                success: false,
                message: 'Kometa instance not found'
            });
        }

        // Read metadata to get Plex servers
        let metadata = {};
        if (fs.existsSync(metaPath)) {
            metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        }

        // Get Plex server details
        let plexServers = [];
        if (metadata.plexServers && metadata.plexServers.length > 0) {
            const serverIds = metadata.plexServers.map(s => s.id);
            plexServers = await db.query(`
                SELECT id, name, url, token, server_id, libraries
                FROM plex_servers
                WHERE id IN (${serverIds.join(',')}) AND is_active = 1
            `);
        }

        // Generate new config YAML (with collections added to libraries)
        const configYaml = generateKometaConfigFromForm(config, plexServers);
        fs.writeFileSync(configPath, configYaml);

        // Generate custom collection files based on unified collections array
        const configDir = path.join(instanceDir, 'config');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        // Process unified collections array
        const collections = config.collections || [];

        // Extract holiday collections
        const holidayCollections = collections.filter(c => c.type === 'holiday');
        if (holidayCollections.length > 0) {
            const holidayYaml = generateHolidayCollectionYamlNew(holidayCollections, config.radarr, config.sonarr);
            fs.writeFileSync(path.join(configDir, 'Holidays.yml'), holidayYaml);
        }

        // Extract decade collections
        const decadeCollections = collections.filter(c => c.type === 'decade');
        if (decadeCollections.length > 0) {
            const decadeYaml = generateDecadeCollectionYaml(decadeCollections);
            fs.writeFileSync(path.join(configDir, 'Decades.yml'), decadeYaml);
        }

        // Extract custom collections
        const customCollections = collections.filter(c => c.type === 'custom');
        if (customCollections.length > 0) {
            const customYaml = generateCustomCollectionYamlNew(customCollections, config.radarr, config.sonarr, config.tautulli);
            fs.writeFileSync(path.join(configDir, 'Custom.yml'), customYaml);
        }

        // Process unified overlays array
        const overlays = config.overlays || [];
        const customOverlays = overlays.filter(o => o.type === 'custom');
        if (customOverlays.length > 0) {
            const overlayYaml = generateCustomOverlayYaml(customOverlays);
            fs.writeFileSync(path.join(configDir, 'Overlays.yml'), overlayYaml);
        }

        // Update metadata with library info
        metadata.configuredLibraries = config.libraries?.map(l => l.name) || [];
        metadata.collections = config.collections;
        metadata.overlays = config.overlays;
        metadata.updatedAt = new Date().toISOString();
        fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

        console.log(`[Kometa] Updated config for instance ${id}`);

        res.json({
            success: true,
            message: 'Configuration saved successfully'
        });
    } catch (error) {
        console.error('[Kometa] Error updating config:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update config',
            error: error.message
        });
    }
});

// ============================================================================
// ASSET MANAGEMENT ENDPOINTS
// ============================================================================

// GET /api/v2/kometa/instances/:id/assets - List assets for an instance
router.get('/instances/:id/assets', async (req, res) => {
    try {
        const { id } = req.params;
        const assetsDir = path.join(KOMETA_DATA_DIR, id, 'config', 'assets');

        if (!fs.existsSync(assetsDir)) {
            return res.json({ success: true, assets: [] });
        }

        const files = fs.readdirSync(assetsDir);
        const assets = files
            .filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f))
            .map(f => {
                const stat = fs.statSync(path.join(assetsDir, f));
                return {
                    name: f,
                    size: stat.size,
                    modified: stat.mtime
                };
            });

        res.json({ success: true, assets });
    } catch (error) {
        console.error('[Kometa] Error listing assets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list assets',
            error: error.message
        });
    }
});

// POST /api/v2/kometa/instances/:id/assets - Upload assets
router.post('/instances/:id/assets', assetUpload.array('assets', 20), async (req, res) => {
    try {
        const uploaded = req.files?.map(f => ({
            name: f.filename,
            size: f.size,
            path: `config/assets/${f.filename}`
        })) || [];

        console.log(`[Kometa] Uploaded ${uploaded.length} assets for instance ${req.params.id}`);

        res.json({
            success: true,
            uploaded,
            message: `Uploaded ${uploaded.length} file(s)`
        });
    } catch (error) {
        console.error('[Kometa] Error uploading assets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload assets',
            error: error.message
        });
    }
});

// GET /api/v2/kometa/instances/:id/assets/:filename - Serve an asset file
router.get('/instances/:id/assets/:filename', async (req, res) => {
    try {
        const { id, filename } = req.params;
        const filePath = path.join(KOMETA_DATA_DIR, id, 'config', 'assets', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Asset not found'
            });
        }

        res.sendFile(filePath);
    } catch (error) {
        console.error('[Kometa] Error serving asset:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to serve asset',
            error: error.message
        });
    }
});

// DELETE /api/v2/kometa/instances/:id/assets/:filename - Delete an asset
router.delete('/instances/:id/assets/:filename', async (req, res) => {
    try {
        const { id, filename } = req.params;
        const filePath = path.join(KOMETA_DATA_DIR, id, 'config', 'assets', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Asset not found'
            });
        }

        fs.unlinkSync(filePath);
        console.log(`[Kometa] Deleted asset ${filename} for instance ${id}`);

        res.json({
            success: true,
            message: 'Asset deleted'
        });
    } catch (error) {
        console.error('[Kometa] Error deleting asset:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete asset',
            error: error.message
        });
    }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate Kometa config.yml from form data
 */
function generateKometaConfigFromForm(formConfig, plexServers) {
    let yaml = `## Kometa Configuration
## Generated by Stream Panel on ${new Date().toISOString()}
## Documentation: https://kometa.wiki/en/latest/config/configuration/

`;

    // Libraries section
    yaml += `libraries:\n`;
    if (formConfig.libraries && formConfig.libraries.length > 0) {
        for (const lib of formConfig.libraries) {
            yaml += `  "${lib.name}":\n`;

            // For multi-server setups, embed the full plex config directly in the library
            // This ensures Kometa uses the correct server for this library
            if (plexServers.length > 1 && lib.serverName) {
                const server = plexServers.find(s => s.name === lib.serverName);
                if (server) {
                    const formPlex = formConfig.plex || {};
                    const serverConfig = formPlex[server.name] || {};
                    yaml += `    plex:\n`;
                    yaml += `      url: ${serverConfig.url || server.url}\n`;
                    yaml += `      token: ${serverConfig.token || server.token}\n`;
                    yaml += `      timeout: ${serverConfig.timeout || 60}\n`;
                    yaml += `      db_cache: ${serverConfig.db_cache || 40}\n`;
                    yaml += `      clean_bundles: ${serverConfig.clean_bundles === true}\n`;
                    yaml += `      empty_trash: ${serverConfig.empty_trash === true}\n`;
                    yaml += `      optimize: ${serverConfig.optimize === true}\n`;
                    yaml += `      verify_ssl: ${serverConfig.verify_ssl !== false}\n`;
                }
            }

            // Collection files - combine user selections with collection-based defaults
            const collectionFiles = [];
            const libraryName = lib.name;

            // Add user-selected collection files
            if (lib.collection_files && lib.collection_files.length > 0) {
                for (const cf of lib.collection_files) {
                    if (typeof cf === 'string') {
                        collectionFiles.push({ default: cf });
                    } else {
                        collectionFiles.push(cf);
                    }
                }
            }

            // Process unified collections array
            const collections = formConfig.collections || [];

            // Helper to check if a collection applies to this library
            const collectionAppliesTo = (col) => {
                if (!col.libraries || col.libraries.length === 0) return true;
                return col.libraries.includes(libraryName);
            };

            // Check for each collection type and add appropriate defaults
            // All collection types store items as objects keyed by item name
            // Helper to check if any item is enabled
            const hasEnabledItem = (items) => items && Object.keys(items).some(k => items[k]?.enabled !== false);

            const hasGenre = collections.some(c => c.type === 'genre' && collectionAppliesTo(c) && hasEnabledItem(c.settings?.items));
            const hasDecade = collections.some(c => c.type === 'decade' && collectionAppliesTo(c) && hasEnabledItem(c.settings?.items));
            const hasAwards = collections.some(c => c.type === 'awards' && collectionAppliesTo(c) && hasEnabledItem(c.settings?.items));
            const hasNetwork = collections.some(c => c.type === 'network' && collectionAppliesTo(c) && hasEnabledItem(c.settings?.items));
            const hasStudio = collections.some(c => c.type === 'studio' && collectionAppliesTo(c) && hasEnabledItem(c.settings?.items));
            const hasHoliday = collections.some(c => c.type === 'holiday' && collectionAppliesTo(c) && hasEnabledItem(c.settings?.items));
            const hasCustom = collections.some(c => c.type === 'custom' && collectionAppliesTo(c));

            if (hasGenre) collectionFiles.push({ default: 'genre' });
            if (hasDecade) collectionFiles.push({ file: 'config/Decades.yml' });
            if (hasAwards) collectionFiles.push({ default: 'award' });
            if (hasNetwork) collectionFiles.push({ default: 'network' });
            if (hasStudio) collectionFiles.push({ default: 'studio' });
            if (hasHoliday) collectionFiles.push({ file: 'config/Holidays.yml' });
            if (hasCustom) collectionFiles.push({ file: 'config/Custom.yml' });

            // Write collection files
            if (collectionFiles.length > 0) {
                yaml += `    collection_files:\n`;
                for (const cf of collectionFiles) {
                    if (cf.default) {
                        yaml += `      - default: ${cf.default}\n`;
                    } else if (cf.file) {
                        yaml += `      - file: ${cf.file}\n`;
                    }
                }
            }

            // Process unified overlays array
            const overlays = formConfig.overlays || [];
            const overlayFiles = [];

            // Helper to check if an overlay applies to this library
            const overlayAppliesTo = (ovl) => {
                if (!ovl.libraries || ovl.libraries.length === 0) return true;
                return ovl.libraries.includes(libraryName);
            };

            // Check for each overlay type and add appropriate defaults
            const overlayTypeMap = {
                resolution: 'resolution',
                video_format: 'video_format',
                audio_codec: 'audio_codec',
                ratings: 'ratings',
                content_rating: 'content_rating',
                streaming: 'streaming',
                network: 'network',
                studio: 'studio',
                status: 'status',
                ribbon: 'ribbon',
                languages: 'languages'
            };

            for (const [type, defaultName] of Object.entries(overlayTypeMap)) {
                if (overlays.some(o => o.type === type && overlayAppliesTo(o))) {
                    overlayFiles.push({ default: defaultName });
                }
            }

            // Check for custom overlays
            const hasCustomOverlays = overlays.some(o => o.type === 'custom' && overlayAppliesTo(o));
            if (hasCustomOverlays) {
                overlayFiles.push({ file: 'config/Overlays.yml' });
            }

            // Write overlay files
            if (overlayFiles.length > 0) {
                yaml += `    overlay_files:\n`;
                for (const of_ of overlayFiles) {
                    if (of_.default) {
                        yaml += `      - default: ${of_.default}\n`;
                    } else if (of_.file) {
                        yaml += `      - file: ${of_.file}\n`;
                    }
                }
            }

            // Operations
            if (lib.operations && Object.keys(lib.operations).length > 0) {
                yaml += `    operations:\n`;
                for (const [key, value] of Object.entries(lib.operations)) {
                    yaml += `      ${key}: ${value}\n`;
                }
            }
        }
    } else {
        yaml += `  # No libraries configured yet\n`;
        yaml += `  # Add libraries using the configurator\n`;
    }

    // Settings section - use all provided settings
    yaml += `\nsettings:\n`;
    const settings = formConfig.settings || {};
    yaml += `  cache: ${settings.cache !== false}\n`;
    yaml += `  cache_expiration: ${settings.cache_expiration || 60}\n`;
    yaml += `  asset_directory: config/assets\n`;
    yaml += `  asset_folders: ${settings.asset_folders !== false}\n`;
    yaml += `  asset_depth: 0\n`;
    yaml += `  create_asset_folders: false\n`;
    yaml += `  dimensional_asset_rename: false\n`;
    yaml += `  download_url_assets: false\n`;
    yaml += `  show_missing_season_assets: false\n`;
    yaml += `  show_missing_episode_assets: false\n`;
    yaml += `  show_asset_not_needed: true\n`;
    yaml += `  sync_mode: ${settings.sync_mode || 'append'}\n`;
    yaml += `  minimum_items: ${settings.minimum_items || 1}\n`;
    yaml += `  default_collection_order:\n`;
    yaml += `  delete_below_minimum: ${settings.delete_below_minimum !== false}\n`;
    yaml += `  delete_not_scheduled: ${settings.delete_not_scheduled === true}\n`;
    yaml += `  run_again_delay: ${settings.run_again_delay || 2}\n`;
    yaml += `  missing_only_released: ${settings.missing_only_released === true}\n`;
    yaml += `  only_filter_missing: ${settings.only_filter_missing === true}\n`;
    yaml += `  show_unmanaged: ${settings.show_unmanaged !== false}\n`;
    yaml += `  show_filtered: ${settings.show_filtered === true}\n`;
    yaml += `  show_options: ${settings.show_options === true}\n`;
    yaml += `  show_missing: ${settings.show_missing === true}\n`;
    yaml += `  show_missing_assets: false\n`;
    yaml += `  save_missing: ${settings.save_missing !== false}\n`;
    yaml += `  tvdb_language: ${settings.tvdb_language || 'eng'}\n`;
    yaml += `  ignore_ids:\n`;
    yaml += `  ignore_imdb_ids:\n`;
    yaml += `  item_refresh_delay: ${settings.item_refresh_delay || 0}\n`;
    yaml += `  verify_ssl: ${settings.verify_ssl !== false}\n`;
    yaml += `  playlist_sync_to_users: ${settings.playlist_sync_to_users || 'all'}\n`;
    yaml += `  custom_repo:\n`;
    yaml += `  prioritize_assets: false\n`;
    yaml += `  show_unconfigured: true\n`;
    yaml += `  playlist_exclude_users:\n`;
    yaml += `  playlist_report: true\n`;
    yaml += `  check_nightly: false\n`;
    yaml += `  run_order:\n`;
    yaml += `    - operations\n`;
    yaml += `    - metadata\n`;
    yaml += `    - collections\n`;
    yaml += `    - overlays\n`;
    yaml += `  overlay_artwork_filetype: ${settings.overlay_artwork_filetype || 'jpg'}\n`;
    if (settings.overlay_artwork_quality) {
        yaml += `  overlay_artwork_quality: ${settings.overlay_artwork_quality}\n`;
    } else {
        yaml += `  overlay_artwork_quality:\n`;
    }

    // Plex section - use form config if provided, otherwise fall back to server defaults
    yaml += `\n`;
    const formPlex = formConfig.plex || {};
    if (plexServers.length > 1) {
        yaml += `plex:\n`;
        // For multi-server, put global defaults FIRST, then named servers
        // This ensures Kometa recognizes the structure properly
        const firstServer = plexServers[0];
        const firstServerConfig = formPlex[firstServer.name] || {};
        yaml += `  # Global defaults - using ${firstServer.name} as default\n`;
        yaml += `  url: ${firstServerConfig.url || firstServer.url}\n`;
        yaml += `  token: ${firstServerConfig.token || firstServer.token}\n`;
        yaml += `  timeout: 60\n`;
        yaml += `  db_cache: 40\n`;
        yaml += `  clean_bundles: false\n`;
        yaml += `  empty_trash: false\n`;
        yaml += `  optimize: false\n`;
        yaml += `  verify_ssl: true\n`;
        yaml += `\n`;
        // Now add named server entries that override defaults
        for (const server of plexServers) {
            const serverConfig = formPlex[server.name] || {};
            const serverKey = server.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            yaml += `  ${serverKey}:\n`;
            yaml += `    url: ${serverConfig.url || server.url}\n`;
            yaml += `    token: ${serverConfig.token || server.token}\n`;
            yaml += `    timeout: ${serverConfig.timeout || 60}\n`;
            yaml += `    db_cache: ${serverConfig.db_cache || 40}\n`;
            yaml += `    clean_bundles: ${serverConfig.clean_bundles === true}\n`;
            yaml += `    empty_trash: ${serverConfig.empty_trash === true}\n`;
            yaml += `    optimize: ${serverConfig.optimize === true}\n`;
            yaml += `    verify_ssl: ${serverConfig.verify_ssl !== false}\n`;
        }
    } else if (plexServers.length === 1) {
        const server = plexServers[0];
        const serverConfig = formPlex[server.name] || {};
        yaml += `plex:\n`;
        yaml += `  url: ${serverConfig.url || server.url}\n`;
        yaml += `  token: ${serverConfig.token || server.token}\n`;
        yaml += `  timeout: ${serverConfig.timeout || 60}\n`;
        yaml += `  db_cache: ${serverConfig.db_cache || 40}\n`;
        yaml += `  clean_bundles: ${serverConfig.clean_bundles === true}\n`;
        yaml += `  empty_trash: ${serverConfig.empty_trash === true}\n`;
        yaml += `  optimize: ${serverConfig.optimize === true}\n`;
        yaml += `  verify_ssl: ${serverConfig.verify_ssl !== false}\n`;
    } else {
        yaml += `plex:\n`;
        yaml += `  url: # Your Plex server URL\n`;
        yaml += `  token: # Your Plex token\n`;
        yaml += `  timeout: 60\n`;
        yaml += `  db_cache: 40\n`;
        yaml += `  clean_bundles: false\n`;
        yaml += `  empty_trash: false\n`;
        yaml += `  optimize: false\n`;
        yaml += `  verify_ssl: true\n`;
    }

    // TMDb section
    yaml += `\ntmdb:\n`;
    yaml += `  apikey: ${formConfig.tmdb_apikey || '# Your TMDb API key'}\n`;
    yaml += `  language: en\n`;
    yaml += `  cache_expiration: 60\n`;

    // OMDb section (optional)
    if (formConfig.omdb_apikey) {
        yaml += `\nomdb:\n`;
        yaml += `  apikey: ${formConfig.omdb_apikey}\n`;
        yaml += `  cache_expiration: 60\n`;
    }

    // Trakt section (optional)
    if (formConfig.trakt && formConfig.trakt.enabled && formConfig.trakt.client_id) {
        yaml += `\ntrakt:\n`;
        yaml += `  client_id: ${formConfig.trakt.client_id}\n`;
        yaml += `  client_secret: ${formConfig.trakt.client_secret}\n`;
        yaml += `  pin:\n`;

        // Parse and add authorization block if provided
        if (formConfig.trakt.authorization_yaml && formConfig.trakt.authorization_yaml.trim()) {
            yaml += `  authorization:\n`;
            // Parse the YAML-like text from the textarea
            const authLines = formConfig.trakt.authorization_yaml.trim().split('\n');
            for (const line of authLines) {
                const trimmed = line.trim();
                if (trimmed && trimmed.includes(':')) {
                    // Add proper indentation for each key: value pair
                    yaml += `    ${trimmed}\n`;
                }
            }
        }
        yaml += `  force_refresh:\n`;
    }

    // Tautulli integration
    if (formConfig.tautulli && formConfig.tautulli.enabled) {
        yaml += `\ntautulli:\n`;
        yaml += `  url: ${formConfig.tautulli.url}\n`;
        yaml += `  apikey: ${formConfig.tautulli.apikey}\n`;
    }

    // Radarr integration
    if (formConfig.radarr && formConfig.radarr.enabled) {
        const r = formConfig.radarr;
        yaml += `\nradarr:\n`;
        yaml += `  url: ${r.url}\n`;
        yaml += `  token: ${r.token || r.apikey}\n`;
        yaml += `  add_missing: ${r.add_missing === true}\n`;
        yaml += `  add_existing: ${r.add_existing === true}\n`;
        yaml += `  upgrade_existing: ${r.upgrade_existing === true}\n`;
        yaml += `  monitor_existing: ${r.monitor_existing === true}\n`;
        yaml += `  root_folder_path: ${r.root_folder_path || '/movies'}\n`;
        yaml += `  monitor: ${r.monitor !== false}\n`;
        yaml += `  availability: ${r.availability || 'announced'}\n`;
        yaml += `  quality_profile: ${r.quality_profile || 'HD-1080p'}\n`;
        if (r.tag) yaml += `  tag: ${r.tag}\n`;
        yaml += `  search: ${r.search === true}\n`;
        if (r.radarr_path) yaml += `  radarr_path: ${r.radarr_path}\n`;
        if (r.plex_path) yaml += `  plex_path: ${r.plex_path}\n`;
        yaml += `  ignore_cache: ${r.ignore_cache === true}\n`;
    }

    // Sonarr integration
    if (formConfig.sonarr && formConfig.sonarr.enabled) {
        const s = formConfig.sonarr;
        yaml += `\nsonarr:\n`;
        yaml += `  url: ${s.url}\n`;
        yaml += `  token: ${s.token || s.apikey}\n`;
        yaml += `  add_missing: ${s.add_missing === true}\n`;
        yaml += `  add_existing: ${s.add_existing === true}\n`;
        yaml += `  upgrade_existing: ${s.upgrade_existing === true}\n`;
        yaml += `  monitor_existing: ${s.monitor_existing === true}\n`;
        yaml += `  root_folder_path: ${s.root_folder_path || '/tv'}\n`;
        yaml += `  monitor: ${s.monitor || 'all'}\n`;
        yaml += `  quality_profile: ${s.quality_profile || 'HD-1080p'}\n`;
        yaml += `  language_profile: ${s.language_profile || 'English'}\n`;
        yaml += `  series_type: ${s.series_type || 'standard'}\n`;
        yaml += `  season_folder: ${s.season_folder !== false}\n`;
        if (s.tag) yaml += `  tag: ${s.tag}\n`;
        yaml += `  search: ${s.search === true}\n`;
        yaml += `  cutoff_search: ${s.cutoff_search === true}\n`;
        if (s.sonarr_path) yaml += `  sonarr_path: ${s.sonarr_path}\n`;
        if (s.plex_path) yaml += `  plex_path: ${s.plex_path}\n`;
        yaml += `  ignore_cache: ${s.ignore_cache === true}\n`;
    }

    return yaml;
}

/**
 * Generate Holiday collection YAML based on user selections
 */
function generateHolidayCollectionYaml(holidays, radarrConfig, sonarrConfig) {
    // Default Trakt lists for holidays if user doesn't provide any
    const defaultTraktLists = {
        'christmas': ['https://trakt.tv/users/movistapp/lists/christmas-movies', 'https://trakt.tv/users/questio/lists/christmas-movies'],
        'halloween': ['https://trakt.tv/users/29zombies/lists/halloween', 'https://trakt.tv/users/galax22/lists/halloween-movies'],
        'thanksgiving': ['https://trakt.tv/users/soulpour/lists/thanksgiving-movies'],
        'valentines_day': ['https://trakt.tv/users/movistapp/lists/romantic-movies'],
        'st_patricks_day': ['https://trakt.tv/users/movistapp/lists/st-patricks-day'],
        'easter': ['https://trakt.tv/users/movistapp/lists/easter-movies'],
        'independence_day': ['https://trakt.tv/users/movistapp/lists/4th-of-july'],
        'new_years_eve': ['https://trakt.tv/users/movistapp/lists/new-years-eve-movies']
    };

    let yaml = `## Holiday Collections
## Generated by Stream Panel
## These collections only appear during their respective date ranges

collections:
`;

    for (const [key, config] of Object.entries(holidays)) {
        if (!config.enabled) continue;

        // Use the name from config if available, otherwise format from key
        const name = config.name || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        yaml += `  ${name}:\n`;
        yaml += `    smart_label: random\n`;

        // Schedule (date range)
        if (config.start && config.end) {
            yaml += `    schedule: range(${config.start}-${config.end})\n`;
        }

        // Sort title (for collection ordering)
        if (config.sort_title) {
            yaml += `    sort_title: ${config.sort_title}\n`;
        }

        // Poster URL
        if (config.poster) {
            yaml += `    url_poster: ${config.poster}\n`;
        }

        // Summary/Description
        if (config.summary) {
            yaml += `    summary: "${config.summary.replace(/"/g, '\\"')}"\n`;
        }

        // Parse user-provided Trakt lists (textarea, one per line)
        let traktLists = [];
        if (config.trakt_lists && config.trakt_lists.trim()) {
            traktLists = config.trakt_lists.split('\n').map(l => l.trim()).filter(l => l);
        }
        // Fall back to defaults if no user lists provided
        if (traktLists.length === 0) {
            traktLists = defaultTraktLists[key] || [];
        }

        if (traktLists.length > 0) {
            yaml += `    trakt_list:\n`;
            for (const list of traktLists) {
                yaml += `      - ${list}\n`;
            }
        }

        // Parse user-provided IMDb lists (textarea, one per line)
        let imdbLists = [];
        if (config.imdb_lists && config.imdb_lists.trim()) {
            imdbLists = config.imdb_lists.split('\n').map(l => l.trim()).filter(l => l);
        }

        if (imdbLists.length > 0) {
            yaml += `    imdb_list:\n`;
            for (const list of imdbLists) {
                yaml += `      - ${list}\n`;
            }
        }

        yaml += `    sync_mode: sync\n`;
        yaml += `    collection_order: random\n`;

        // Add Radarr options - use per-holiday settings if enabled
        if (config.radarr_enabled && radarrConfig?.enabled) {
            if (config.radarr_add_missing) {
                yaml += `    radarr_add_missing: true\n`;
            }
            if (config.radarr_search) {
                yaml += `    radarr_search: true\n`;
            }
            if (config.radarr_monitor) {
                yaml += `    radarr_monitor: true\n`;
            }
        } else if (radarrConfig?.enabled && radarrConfig?.add_missing) {
            // Fallback to global Radarr settings if no per-holiday config
            yaml += `    radarr_add_missing: true\n`;
        }

        // Add Sonarr options - use per-holiday settings if enabled
        if (config.sonarr_enabled && sonarrConfig?.enabled) {
            if (config.sonarr_add_missing) {
                yaml += `    sonarr_add_missing: true\n`;
            }
            if (config.sonarr_search) {
                yaml += `    sonarr_search: true\n`;
            }
            if (config.sonarr_monitor) {
                yaml += `    sonarr_monitor: true\n`;
            }
        } else if (sonarrConfig?.enabled && sonarrConfig?.add_missing) {
            // Fallback to global Sonarr settings if no per-holiday config
            yaml += `    sonarr_add_missing: true\n`;
        }

        yaml += `\n`;
    }

    return yaml;
}

/**
 * Generate Custom Collections YAML
 * Now supports multiple Trakt/IMDb lists, full Radarr/Sonarr options, and more
 */
function generateCustomCollectionYaml(customCollections, radarrConfig, sonarrConfig, tautulliConfig) {
    // Separate collections by library type
    const movieCollections = customCollections.filter(cc => cc.library_type === 'movie');
    const showCollections = customCollections.filter(cc => cc.library_type === 'show');

    let yaml = `## Custom Collections
## Generated by Stream Panel
## Movie collections and TV Show collections are separated for clarity

`;

    // Helper function to generate collection YAML
    const generateCollection = (cc, isMovie) => {
        let collYaml = '';
        collYaml += `  "${cc.name}":\n`;
        collYaml += `    smart_label: random\n`;

        // Schedule (date range)
        if (cc.schedule === 'date_range' && cc.start_date && cc.end_date) {
            collYaml += `    schedule: range(${cc.start_date}-${cc.end_date})\n`;
        }

        // Sort title
        if (cc.sort_title) {
            collYaml += `    sort_title: ${cc.sort_title}\n`;
        }

        // Poster URL
        if (cc.poster) {
            collYaml += `    url_poster: ${cc.poster}\n`;
        }

        // Summary
        if (cc.summary) {
            collYaml += `    summary: "${cc.summary.replace(/"/g, '\\"')}"\n`;
        }

        // Trakt lists (multi-line textarea)
        let traktLists = [];
        if (cc.trakt_lists && cc.trakt_lists.trim()) {
            traktLists = cc.trakt_lists.split('\n').map(l => l.trim()).filter(l => l);
        }
        if (traktLists.length > 0) {
            collYaml += `    trakt_list:\n`;
            for (const list of traktLists) {
                collYaml += `      - ${list}\n`;
            }
        }

        // IMDb lists (multi-line textarea)
        let imdbLists = [];
        if (cc.imdb_lists && cc.imdb_lists.trim()) {
            imdbLists = cc.imdb_lists.split('\n').map(l => l.trim()).filter(l => l);
        }
        if (imdbLists.length > 0) {
            collYaml += `    imdb_list:\n`;
            for (const list of imdbLists) {
                collYaml += `      - ${list}\n`;
            }
        }

        // TMDb Collection ID
        if (cc.tmdb_collection) {
            collYaml += `    tmdb_collection: ${cc.tmdb_collection}\n`;
        }

        // TMDb Keyword ID
        if (cc.tmdb_keyword) {
            collYaml += `    tmdb_keyword: ${cc.tmdb_keyword}\n`;
        }

        // Tautulli Popular
        if (cc.tautulli_days && tautulliConfig?.enabled) {
            collYaml += `    tautulli_popular:\n`;
            collYaml += `      list_days: ${cc.tautulli_days}\n`;
            collYaml += `      list_size: 30\n`;
            collYaml += `      list_buffer: 20\n`;
        }

        collYaml += `    sync_mode: sync\n`;
        collYaml += `    collection_order: random\n`;

        // Radarr options (for movies)
        if (isMovie && cc.radarr_enabled && radarrConfig?.enabled) {
            if (cc.radarr_add_missing) {
                collYaml += `    radarr_add_missing: true\n`;
            }
            if (cc.radarr_search) {
                collYaml += `    radarr_search: true\n`;
            }
            if (cc.radarr_monitor) {
                collYaml += `    radarr_monitor: true\n`;
            }
        }

        // Sonarr options (for TV shows)
        if (!isMovie && cc.sonarr_enabled && sonarrConfig?.enabled) {
            if (cc.sonarr_add_missing) {
                collYaml += `    sonarr_add_missing: true\n`;
            }
            if (cc.sonarr_search) {
                collYaml += `    sonarr_search: true\n`;
            }
            if (cc.sonarr_monitor) {
                collYaml += `    sonarr_monitor: true\n`;
            }
        }

        collYaml += `\n`;
        return collYaml;
    };

    // Generate movie collections
    if (movieCollections.length > 0) {
        yaml += `## Movie Collections\ncollections:\n`;
        for (const cc of movieCollections) {
            if (!cc.name) continue;
            yaml += generateCollection(cc, true);
        }
    }

    // Generate TV show collections (these need to be in a separate file or under a different library)
    if (showCollections.length > 0) {
        yaml += `\n## TV Show Collections\n## Note: Apply these to your TV Show libraries\ncollections_tv:\n`;
        for (const cc of showCollections) {
            if (!cc.name) continue;
            yaml += generateCollection(cc, false);
        }
    }

    // If no collections, add placeholder
    if (movieCollections.length === 0 && showCollections.length === 0) {
        yaml += `collections:\n  # No custom collections configured\n`;
    }

    return yaml;
}

/**
 * Generate Holiday collection YAML based on new unified collections structure
 */
function generateHolidayCollectionYamlNew(holidayCollections, radarrConfig, sonarrConfig) {
    // Default Trakt lists for holidays if user doesn't provide any
    const defaultTraktLists = {
        'christmas': ['https://trakt.tv/users/movistapp/lists/christmas-movies', 'https://trakt.tv/users/questio/lists/christmas-movies'],
        'halloween': ['https://trakt.tv/users/29zombies/lists/halloween', 'https://trakt.tv/users/galax22/lists/halloween-movies'],
        'thanksgiving': ['https://trakt.tv/users/soulpour/lists/thanksgiving-movies'],
        'valentines_day': ['https://trakt.tv/users/movistapp/lists/romantic-movies'],
        'st_patricks_day': ['https://trakt.tv/users/movistapp/lists/st-patricks-day'],
        'easter': ['https://trakt.tv/users/movistapp/lists/easter-movies'],
        'independence_day': ['https://trakt.tv/users/movistapp/lists/4th-of-july'],
        'new_years_eve': ['https://trakt.tv/users/movistapp/lists/new-years-eve-movies']
    };

    let yaml = `## Holiday Collections
## Generated by Stream Panel
## These collections only appear during their respective date ranges

collections:
`;

    // Process each holiday collection configuration
    for (const col of holidayCollections) {
        const holidays = col.holidays || {};

        for (const [key, holidayConfig] of Object.entries(holidays)) {
            if (!holidayConfig.enabled) continue;

            // Use the name from config if available, otherwise format from key
            const name = holidayConfig.name || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

            yaml += `  ${name}:\n`;
            yaml += `    smart_label: random\n`;

            // Schedule (date range)
            if (holidayConfig.start && holidayConfig.end) {
                yaml += `    schedule: range(${holidayConfig.start}-${holidayConfig.end})\n`;
            }

            // Sort title (for collection ordering)
            if (holidayConfig.sort_title) {
                yaml += `    sort_title: ${holidayConfig.sort_title}\n`;
            }

            // Poster URL
            if (holidayConfig.poster) {
                yaml += `    url_poster: ${holidayConfig.poster}\n`;
            }

            // Summary/Description
            if (holidayConfig.summary) {
                yaml += `    summary: "${holidayConfig.summary.replace(/"/g, '\\"')}"\n`;
            }

            // Parse user-provided Trakt lists (textarea, one per line)
            let traktLists = [];
            if (holidayConfig.trakt_lists && holidayConfig.trakt_lists.trim()) {
                traktLists = holidayConfig.trakt_lists.split('\n').map(l => l.trim()).filter(l => l);
            }
            // Fall back to defaults if no user lists provided
            if (traktLists.length === 0) {
                traktLists = defaultTraktLists[key] || [];
            }

            if (traktLists.length > 0) {
                yaml += `    trakt_list:\n`;
                for (const list of traktLists) {
                    yaml += `      - ${list}\n`;
                }
            }

            // Parse user-provided IMDb lists (textarea, one per line)
            let imdbLists = [];
            if (holidayConfig.imdb_lists && holidayConfig.imdb_lists.trim()) {
                imdbLists = holidayConfig.imdb_lists.split('\n').map(l => l.trim()).filter(l => l);
            }

            if (imdbLists.length > 0) {
                yaml += `    imdb_list:\n`;
                for (const list of imdbLists) {
                    yaml += `      - ${list}\n`;
                }
            }

            yaml += `    sync_mode: sync\n`;
            yaml += `    collection_order: random\n`;

            // Add Radarr options - use per-holiday settings if enabled
            if (holidayConfig.radarr_enabled && radarrConfig?.enabled) {
                if (holidayConfig.radarr_add_missing) {
                    yaml += `    radarr_add_missing: true\n`;
                }
                if (holidayConfig.radarr_search) {
                    yaml += `    radarr_search: true\n`;
                }
                if (holidayConfig.radarr_monitor) {
                    yaml += `    radarr_monitor: true\n`;
                }
            }

            // Add Sonarr options - use per-holiday settings if enabled
            if (holidayConfig.sonarr_enabled && sonarrConfig?.enabled) {
                if (holidayConfig.sonarr_add_missing) {
                    yaml += `    sonarr_add_missing: true\n`;
                }
                if (holidayConfig.sonarr_search) {
                    yaml += `    sonarr_search: true\n`;
                }
                if (holidayConfig.sonarr_monitor) {
                    yaml += `    sonarr_monitor: true\n`;
                }
            }

            yaml += `\n`;
        }
    }

    return yaml;
}

/**
 * Generate Decade Collections YAML
 */
function generateDecadeCollectionYaml(decadeCollections) {
    let yaml = `## Decade Collections
## Generated by Stream Panel

templates:
  Decade:
    smart_filter:
      sort_by: critic_rating.desc
      all:
        year.gte: <<decade>>
        year.lt: <<decade_end>>
    url_poster: <<poster>>
    summary: <<summary>>
    collection_mode: <<collection_mode>>
    sync_mode: sync

collections:
`;

    // Process each decade collection configuration
    for (const col of decadeCollections) {
        const items = col.settings?.items || {};

        for (const [key, decadeConfig] of Object.entries(items)) {
            if (!decadeConfig.enabled) continue;

            const decade = decadeConfig.decade || parseInt(key.replace('s', ''));
            const decadeEnd = decade + 10;
            const name = decadeConfig.name || `${key}'s Films`;
            const poster = decadeConfig.poster || '';
            const summary = decadeConfig.summary || `A collection of films from the ${key}`;
            const collectionMode = decadeConfig.collection_mode || 'hide';
            const sortTitle = decadeConfig.sort_title || '';

            yaml += `  "${name}":\n`;
            yaml += `    template:\n`;
            yaml += `      name: Decade\n`;
            yaml += `      decade: ${decade}\n`;
            yaml += `      decade_end: ${decadeEnd}\n`;
            if (poster) {
                yaml += `      poster: ${poster}\n`;
            }
            yaml += `      summary: "${summary.replace(/"/g, '\\"')}"\n`;
            yaml += `      collection_mode: ${collectionMode}\n`;
            if (sortTitle) {
                yaml += `    sort_title: "${sortTitle}"\n`;
            }
            yaml += `\n`;
        }
    }

    return yaml;
}

/**
 * Generate Custom Collections YAML from new unified collections structure
 */
function generateCustomCollectionYamlNew(customCollections, radarrConfig, sonarrConfig, tautulliConfig) {
    let yaml = `## Custom Collections
## Generated by Stream Panel

collections:
`;

    for (const col of customCollections) {
        if (!col.name) continue;

        yaml += `  "${col.name}":\n`;
        yaml += `    smart_label: random\n`;

        // Schedule (date range)
        if (col.schedule === 'date_range' && col.start_date && col.end_date) {
            yaml += `    schedule: range(${col.start_date}-${col.end_date})\n`;
        }

        // Sort title
        if (col.sort_title) {
            yaml += `    sort_title: ${col.sort_title}\n`;
        }

        // Poster URL
        if (col.poster) {
            yaml += `    url_poster: ${col.poster}\n`;
        }

        // Summary
        if (col.summary) {
            yaml += `    summary: "${col.summary.replace(/"/g, '\\"')}"\n`;
        }

        // Trakt lists (multi-line textarea)
        let traktLists = [];
        if (col.trakt_lists && col.trakt_lists.trim()) {
            traktLists = col.trakt_lists.split('\n').map(l => l.trim()).filter(l => l);
        }
        if (traktLists.length > 0) {
            yaml += `    trakt_list:\n`;
            for (const list of traktLists) {
                yaml += `      - ${list}\n`;
            }
        }

        // IMDb lists (multi-line textarea)
        let imdbLists = [];
        if (col.imdb_lists && col.imdb_lists.trim()) {
            imdbLists = col.imdb_lists.split('\n').map(l => l.trim()).filter(l => l);
        }
        if (imdbLists.length > 0) {
            yaml += `    imdb_list:\n`;
            for (const list of imdbLists) {
                yaml += `      - ${list}\n`;
            }
        }

        // TMDb Collection ID
        if (col.tmdb_collection) {
            yaml += `    tmdb_collection: ${col.tmdb_collection}\n`;
        }

        // TMDb Keyword ID
        if (col.tmdb_keyword) {
            yaml += `    tmdb_keyword: ${col.tmdb_keyword}\n`;
        }

        // Tautulli Popular
        if (col.tautulli_days && tautulliConfig?.enabled) {
            yaml += `    tautulli_popular:\n`;
            yaml += `      list_days: ${col.tautulli_days}\n`;
            yaml += `      list_size: 30\n`;
            yaml += `      list_buffer: 20\n`;
        }

        yaml += `    sync_mode: sync\n`;
        yaml += `    collection_order: random\n`;

        // Radarr options
        if (col.radarr_enabled && radarrConfig?.enabled) {
            if (col.radarr_add_missing) {
                yaml += `    radarr_add_missing: true\n`;
            }
            if (col.radarr_search) {
                yaml += `    radarr_search: true\n`;
            }
            if (col.radarr_monitor) {
                yaml += `    radarr_monitor: true\n`;
            }
        }

        // Sonarr options
        if (col.sonarr_enabled && sonarrConfig?.enabled) {
            if (col.sonarr_add_missing) {
                yaml += `    sonarr_add_missing: true\n`;
            }
            if (col.sonarr_search) {
                yaml += `    sonarr_search: true\n`;
            }
            if (col.sonarr_monitor) {
                yaml += `    sonarr_monitor: true\n`;
            }
        }

        yaml += `\n`;
    }

    return yaml;
}

/**
 * Generate Custom Overlays YAML from unified overlays structure
 */
function generateCustomOverlayYaml(customOverlays) {
    let yaml = `## Custom Overlays
## Generated by Stream Panel

overlays:
`;

    for (const ovl of customOverlays) {
        if (!ovl.settings?.name) continue;

        const name = ovl.settings.name;
        yaml += `  ${name.replace(/[^a-zA-Z0-9_]/g, '_')}:\n`;

        // Overlay image
        if (ovl.settings.image) {
            if (ovl.settings.image.startsWith('http')) {
                yaml += `    url: ${ovl.settings.image}\n`;
            } else {
                yaml += `    file: ${ovl.settings.image}\n`;
            }
        }

        // Position mapping
        const positionMap = {
            'top_left': ['left', 'top'],
            'top_right': ['right', 'top'],
            'bottom_left': ['left', 'bottom'],
            'bottom_right': ['right', 'bottom'],
            'center': ['center', 'center']
        };

        const position = ovl.settings.position || 'bottom_right';
        const [horizontal, vertical] = positionMap[position] || ['right', 'bottom'];

        yaml += `    horizontal_align: ${horizontal}\n`;
        yaml += `    vertical_align: ${vertical}\n`;

        // Size (as percentage)
        if (ovl.settings.size) {
            yaml += `    horizontal_offset: ${ovl.settings.size}\n`;
            yaml += `    vertical_offset: ${ovl.settings.size}\n`;
        }

        yaml += `\n`;
    }

    return yaml;
}

/**
 * Generate a basic Kometa config.yml for the given Plex servers
 */
function generateKometaConfig(plexServers) {
    let config = `## Kometa Configuration
## Generated by Stream Panel on ${new Date().toISOString()}
## Documentation: https://kometa.wiki/en/latest/config/configuration/

`;

    // Libraries section
    config += `libraries:\n`;

    if (plexServers.length === 0) {
        config += `  # No Plex servers configured yet
  # Add your library configurations here
  # Example:
  # Movies:
  #   collection_files:
  #     - default: basic
`;
    } else {
        // Add comment about libraries
        config += `  # Add your library configurations below
  # Example:
  # Movies:
  #   collection_files:
  #     - default: basic
`;
    }

    // Settings section
    config += `
settings:
  cache: true
  cache_expiration: 60
  asset_directory: config/assets
  asset_folders: true
  asset_depth: 0
  create_asset_folders: false
  sync_mode: append
  minimum_items: 1
  delete_below_minimum: true
  delete_not_scheduled: false
  run_again_delay: 2
  missing_only_released: false
  show_unmanaged: true
  show_filtered: false
  show_options: false
  show_missing: false
  save_missing: true
  tvdb_language: eng
  verify_ssl: true
  run_order:
    - operations
    - metadata
    - collections
    - overlays

`;

    // Plex section - support multiple servers
    if (plexServers.length > 1) {
        // Multiple servers - use named server format
        config += `plex:\n`;
        for (const server of plexServers) {
            const serverKey = server.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            config += `  ${serverKey}:
    url: ${server.url}
    token: ${server.token}
    timeout: 60
    clean_bundles: false
    empty_trash: false
    optimize: false
`;
        }
        config += `\n`;
    } else if (plexServers.length === 1) {
        // Single server - simple format
        const server = plexServers[0];
        config += `plex:
  url: ${server.url}
  token: ${server.token}
  timeout: 60
  clean_bundles: false
  empty_trash: false
  optimize: false

`;
    } else {
        config += `plex:
  url: # Your Plex server URL (e.g., http://192.168.1.100:32400)
  token: # Your Plex token
  timeout: 60
  clean_bundles: false
  empty_trash: false
  optimize: false

`;
    }

    // TMDb section (required)
    config += `tmdb:
  apikey: # Your TMDb API key (get one at https://www.themoviedb.org/settings/api)
  language: en
  cache_expiration: 60

`;

    // Optional sections (commented out)
    config += `# Optional integrations - uncomment and configure as needed:
#
# tautulli:
#   url: http://192.168.1.100:8181
#   apikey: YOUR_TAUTULLI_API_KEY
#
# omdb:
#   apikey: YOUR_OMDB_API_KEY
#   cache_expiration: 60
#
# radarr:
#   url: http://192.168.1.100:7878
#   token: YOUR_RADARR_API_KEY
#   add_missing: false
#   add_existing: false
#   root_folder_path: /movies
#   monitor: true
#   availability: released
#   quality_profile: HD-1080p
#   search: false
#
# sonarr:
#   url: http://192.168.1.100:8989
#   token: YOUR_SONARR_API_KEY
#   add_missing: false
#   add_existing: false
#   root_folder_path: /tv
#   monitor: all
#   quality_profile: HD-1080p
#   language_profile: English
#   series_type: standard
#   season_folder: true
#   search: false
#
# trakt:
#   client_id: YOUR_TRAKT_CLIENT_ID
#   client_secret: YOUR_TRAKT_CLIENT_SECRET
`;

    return config;
}

module.exports = router;
