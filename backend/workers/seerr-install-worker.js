/**
 * Seerr Installation Worker
 *
 * This runs in a completely separate Node.js process (forked from main app)
 * so that it doesn't block the main event loop at all.
 *
 * Downloads source from GitHub, installs dependencies, and builds.
 * All work done in /tmp to avoid Docker volume mount permission issues.
 * Communication with parent process via IPC messages.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Paths from environment or defaults
const SEERR_APP_DIR = process.env.SEERR_APP_DIR || '/app/seerr_app';
const SEERR_DATA_DIR = process.env.SEERR_DATA_DIR || '/app/data/seerr';
const SEERR_VERSION_FILE = path.join(SEERR_APP_DIR, 'seerr_version.json');

// GitHub configuration
const GITHUB_REPO = 'seerr-team/seerr';
const GITHUB_API = 'https://api.github.com';

// Temp build directory (NOT on Docker volume mount)
const BUILD_DIR = '/tmp/seerr-build';

// Track if we're still connected to parent
let parentConnected = true;

// Handle parent disconnect - DON'T exit, just note it
process.on('disconnect', () => {
    console.log('[Seerr Worker] Parent disconnected, but continuing installation...');
    parentConnected = false;
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('[Seerr Worker] Uncaught exception:', err);
    // Try to write an error marker file
    try {
        fs.writeFileSync(path.join(SEERR_APP_DIR, 'install_error.txt'), err.message);
    } catch (e) {}
    process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Seerr Worker] Unhandled rejection:', reason);
});

// Send status update to parent process (safe - won't crash if disconnected)
function sendStatus(status, message, extra = {}) {
    console.log(`[Seerr Worker] ${status}: ${message}`);
    if (parentConnected && process.send) {
        try {
            process.send({ type: 'status', status, message, ...extra });
        } catch (err) {
            console.log('[Seerr Worker] Could not send status to parent:', err.message);
            parentConnected = false;
        }
    }
}

// Helper function to run commands with bounded memory usage
function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        console.log(`[Seerr Worker] Running: ${command} ${args.join(' ')}`);
        const child = spawn(command, args, {
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            ...options
        });

        // Only keep last 2000 chars to avoid OOM during long builds
        let stdout = '';
        let stderr = '';
        const MAX_BUFFER = 2000;

        child.stdout.on('data', (data) => {
            stdout = (stdout + data.toString()).slice(-MAX_BUFFER);
        });

        child.stderr.on('data', (data) => {
            stderr = (stderr + data.toString()).slice(-MAX_BUFFER);
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

// Write version file - critical function with retries
function writeVersionFile(targetVersion) {
    const versionInfo = {
        version: targetVersion,
        installedFrom: `https://github.com/${GITHUB_REPO}`,
        installedAt: new Date().toISOString(),
        method: 'github-source'
    };

    // Try up to 3 times
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            fs.writeFileSync(SEERR_VERSION_FILE, JSON.stringify(versionInfo, null, 2));
            console.log(`[Seerr Worker] Version file written successfully (attempt ${attempt})`);
            return true;
        } catch (err) {
            console.error(`[Seerr Worker] Failed to write version file (attempt ${attempt}):`, err.message);
            if (attempt < 3) {
                // Wait a bit before retry
                const start = Date.now();
                while (Date.now() - start < 500) {} // Sync sleep
            }
        }
    }
    return false;
}

// Main installation function - download from GitHub and build
async function install(targetVersion) {
    try {
        sendStatus('fetching_version', 'Fetching latest version info from GitHub...');

        // Get latest release from GitHub if no version specified
        if (!targetVersion) {
            const releaseResp = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/releases/latest`);
            if (!releaseResp.ok) {
                throw new Error(`Failed to fetch latest release: ${releaseResp.status}`);
            }
            const releaseData = await releaseResp.json();
            targetVersion = releaseData.tag_name.replace(/^v/, ''); // Remove 'v' prefix
        }

        sendStatus('downloading', `Downloading Seerr v${targetVersion} source...`, { version: targetVersion });

        // Create directories
        fs.mkdirSync(SEERR_DATA_DIR, { recursive: true });

        // Clean up build directory (this is in /tmp, NOT on the volume mount)
        if (fs.existsSync(BUILD_DIR)) {
            fs.rmSync(BUILD_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(BUILD_DIR, { recursive: true });

        // Download source tarball from GitHub
        const tarballUrl = `https://github.com/${GITHUB_REPO}/archive/refs/tags/v${targetVersion}.tar.gz`;
        const tarballPath = path.join(BUILD_DIR, 'seerr.tar.gz');

        await runCommand('curl', ['-L', '-o', tarballPath, tarballUrl]);

        // Extract tarball
        sendStatus('extracting', 'Extracting source code...');
        await runCommand('tar', ['-xzf', tarballPath, '-C', BUILD_DIR]);

        // Find extracted directory (usually seerr-{version})
        const entries = fs.readdirSync(BUILD_DIR).filter(e => e.startsWith('seerr-'));
        if (entries.length === 0) {
            throw new Error('Could not find extracted Seerr directory');
        }
        const extractedDir = path.join(BUILD_DIR, entries[0]);

        // Install dependencies (in /tmp, so no permission issues)
        sendStatus('installing_deps', 'Installing dependencies (this may take a few minutes)...');
        await runCommand('pnpm', ['install', '--ignore-scripts'], {
            cwd: extractedDir,
            env: { ...process.env, HUSKY: '0' }
        });

        // Build the application
        sendStatus('building', 'Building Seerr (this may take several minutes)...');
        await runCommand('pnpm', ['build'], {
            cwd: extractedDir,
            env: { ...process.env, NODE_ENV: 'production' }
        });

        // Remove dev dependencies to save space before copying
        sendStatus('cleaning', 'Removing dev dependencies...');
        await runCommand('pnpm', ['prune', '--prod'], {
            cwd: extractedDir
        }).catch(() => {
            console.log('[Seerr Worker] Warning: prune failed, continuing...');
        });

        // Now copy the built app to the final location (Docker volume mount)
        sendStatus('copying', 'Copying built files to final location...');

        // Clear existing seerr_app directory contents
        if (fs.existsSync(SEERR_APP_DIR)) {
            const appEntries = fs.readdirSync(SEERR_APP_DIR);
            for (const entry of appEntries) {
                try {
                    fs.rmSync(path.join(SEERR_APP_DIR, entry), { recursive: true, force: true });
                } catch (e) {
                    console.log(`[Seerr Worker] Warning: Could not remove ${entry}:`, e.message);
                }
            }
        } else {
            fs.mkdirSync(SEERR_APP_DIR, { recursive: true });
        }

        // Copy built app using tar archive (works better with Docker volumes than direct copy)
        // Create tarball in /tmp, then extract to volume mount
        console.log('[Seerr Worker] Creating tarball of built files...');
        const tarballOutput = path.join(BUILD_DIR, 'seerr-built.tar');

        // Create tarball from extracted directory
        await runCommand('tar', ['-cf', tarballOutput, '-C', extractedDir, '.']);
        console.log('[Seerr Worker] Tarball created, extracting to final location...');

        // Extract directly to the app directory
        await runCommand('tar', ['-xf', tarballOutput, '-C', SEERR_APP_DIR]);
        console.log('[Seerr Worker] Extraction completed successfully');

        // Remove .git if it exists
        const gitDir = path.join(SEERR_APP_DIR, '.git');
        if (fs.existsSync(gitDir)) {
            try {
                fs.rmSync(gitDir, { recursive: true, force: true });
            } catch (e) {
                console.log('[Seerr Worker] Warning: Could not remove .git:', e.message);
            }
        }

        console.log('[Seerr Worker] Copy completed, writing version file IMMEDIATELY...');

        // CRITICAL: Write version file SYNCHRONOUSLY right here - no function call
        const versionInfo = {
            version: targetVersion,
            installedFrom: `https://github.com/${GITHUB_REPO}`,
            installedAt: new Date().toISOString(),
            method: 'github-source'
        };
        fs.writeFileSync(SEERR_VERSION_FILE, JSON.stringify(versionInfo, null, 2));
        console.log('[Seerr Worker] Version file written directly');

        const versionWritten = fs.existsSync(SEERR_VERSION_FILE);

        if (!versionWritten) {
            throw new Error('Failed to write version file after 3 attempts');
        }

        // Now do cleanup (non-critical)
        sendStatus('finalizing', 'Cleaning up...');

        try {
            fs.rmSync(BUILD_DIR, { recursive: true, force: true });
            console.log('[Seerr Worker] Build directory cleaned up');
        } catch (cleanupErr) {
            console.log('[Seerr Worker] Warning: Failed to clean up build dir:', cleanupErr.message);
        }

        // Done!
        console.log('[Seerr Worker] Installation complete!');
        sendStatus('complete', `Seerr v${targetVersion} installed successfully!`, { version: targetVersion });

        // Give time for IPC message, then exit
        setTimeout(() => {
            console.log('[Seerr Worker] Exiting with code 0');
            process.exit(0);
        }, 500);

    } catch (error) {
        console.error('[Seerr Worker] Installation error:', error);
        sendStatus('error', `Installation failed: ${error.message}`, { error: error.message });

        // Try to write error marker
        try {
            fs.writeFileSync(path.join(SEERR_APP_DIR, 'install_error.txt'), error.message);
        } catch (e) {}

        setTimeout(() => {
            process.exit(1);
        }, 500);
    }
}

// Get version from command line args or null for latest
const version = process.argv[2] || null;

console.log('[Seerr Worker] Starting installation worker...');
console.log('[Seerr Worker] SEERR_APP_DIR:', SEERR_APP_DIR);
console.log('[Seerr Worker] SEERR_DATA_DIR:', SEERR_DATA_DIR);
console.log('[Seerr Worker] Version:', version || 'latest');

// Start installation
install(version);
