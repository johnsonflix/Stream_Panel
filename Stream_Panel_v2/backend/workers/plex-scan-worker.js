/**
 * Plex Scan Worker
 *
 * Runs Plex library scans in a SEPARATE Node.js process to avoid blocking the main app.
 * Uses IPC messages to communicate progress back to the parent process.
 *
 * This ensures that Request Site API calls (movie details, TV shows, etc.) aren't
 * blocked while a Plex scan is running.
 */

const path = require('path');

// Set up paths relative to this worker file
const BACKEND_DIR = path.join(__dirname, '..');

// Import the scanner service
const { PlexScannerService } = require('../services/plex-scanner-service');

let scanner = null;

function getScanner() {
    if (!scanner) {
        scanner = new PlexScannerService();
    }
    return scanner;
}

/**
 * Send progress update to parent process
 */
function sendProgress(type, data) {
    if (process.send) {
        process.send({ type, ...data });
    }
}

/**
 * Run a full or partial Plex scan
 */
async function runScan(options = {}) {
    const { serverIds, recentOnly = false } = options;
    const scanType = recentOnly ? 'RECENT' : 'FULL';

    sendProgress('status', {
        status: 'running',
        message: `Starting ${scanType} Plex scan...`
    });

    try {
        const scanner = getScanner();

        // Set up progress callbacks
        scanner.onProgress = (progress) => {
            sendProgress('progress', {
                stage: progress.stage || 'scanning',
                current: progress.current,
                total: progress.total,
                message: progress.message
            });
        };

        const results = await scanner.scan({
            serverIds: serverIds && Array.isArray(serverIds) ? serverIds : undefined,
            recentOnly
        });

        sendProgress('complete', {
            success: true,
            results,
            message: `${scanType} scan completed: ${results.totalMovies} movies, ${results.totalTVShows} TV shows`
        });

        return results;

    } catch (error) {
        sendProgress('error', {
            success: false,
            error: error.message,
            message: `${scanType} scan failed: ${error.message}`
        });
        throw error;
    }
}

// Handle messages from parent process
process.on('message', async (msg) => {
    console.log(`[Plex Scan Worker] Received command: ${msg.command}`);

    try {
        switch (msg.command) {
            case 'scan':
                await runScan(msg.options || {});
                break;

            case 'recentScan':
                await runScan({ ...msg.options, recentOnly: true });
                break;

            default:
                sendProgress('error', {
                    success: false,
                    error: `Unknown command: ${msg.command}`
                });
        }
    } catch (error) {
        console.error(`[Plex Scan Worker] Error:`, error);
        // Error already sent via sendProgress in runScan
    }

    // Clean up and exit
    if (scanner) {
        try {
            scanner.close();
        } catch (e) {
            // Ignore cleanup errors
        }
    }

    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('[Plex Scan Worker] Uncaught exception:', error);
    sendProgress('error', {
        success: false,
        error: error.message,
        message: `Worker crashed: ${error.message}`
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Plex Scan Worker] Unhandled rejection:', reason);
    sendProgress('error', {
        success: false,
        error: String(reason),
        message: `Worker promise rejection: ${reason}`
    });
    process.exit(1);
});

console.log('[Plex Scan Worker] Started and waiting for commands...');
sendProgress('ready', { message: 'Plex scan worker ready' });
