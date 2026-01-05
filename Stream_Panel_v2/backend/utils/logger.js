/**
 * Logger Utility
 *
 * Intercepts console.log/console.error and writes to log files
 * while still outputting to console for Docker logs
 */

const fs = require('fs');
const path = require('path');

// Log directory
const LOGS_DIR = path.join(__dirname, '../logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Log file paths - organized by category (each log goes to ONE file only)
const LOG_FILES = {
    // Main logs
    app: path.join(LOGS_DIR, 'app.log'),         // General/misc logs
    error: path.join(LOGS_DIR, 'error.log'),     // All errors (separate copy)

    // Service logs (service-specific activity)
    plex: path.join(LOGS_DIR, 'plex.log'),       // Plex operations & jobs
    iptv: path.join(LOGS_DIR, 'iptv.log'),       // IPTV panel operations & jobs
    email: path.join(LOGS_DIR, 'email.log'),     // Email service & schedules
    dashboard: path.join(LOGS_DIR, 'dashboard.log'), // Dashboard refresh jobs

    // User activity logs
    users: path.join(LOGS_DIR, 'users.log'),     // User management
    subscriptions: path.join(LOGS_DIR, 'subscriptions.log'), // Subscription changes
    auth: path.join(LOGS_DIR, 'auth.log'),       // Login/logout/sessions

    // Portal logs
    portal: path.join(LOGS_DIR, 'portal.log')    // Customer portal activity
};

// Log categories for UI display
const LOG_CATEGORIES = {
    main: {
        name: 'Main',
        files: ['app', 'error']
    },
    services: {
        name: 'Services',
        files: ['plex', 'iptv', 'email', 'dashboard']
    },
    activity: {
        name: 'User Activity',
        files: ['users', 'subscriptions', 'auth']
    },
    portal: {
        name: 'Portal',
        files: ['portal']
    }
};

// Default settings (can be overridden via settings table)
let LOG_SETTINGS = {
    maxFileSizeMB: 10,      // Max size before rotation (MB)
    retentionDays: 7,       // Days to keep old logs
    maxLines: 50000         // Max lines to keep per log file
};

// Max log file size in bytes
const getMaxLogSize = () => LOG_SETTINGS.maxFileSizeMB * 1024 * 1024;

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

/**
 * Format timestamp for log entries
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Rotate log file if it exceeds max size
 */
function rotateLogIfNeeded(logPath) {
    try {
        if (fs.existsSync(logPath)) {
            const stats = fs.statSync(logPath);
            if (stats.size > getMaxLogSize()) {
                // Create dated backup
                const date = new Date().toISOString().split('T')[0];
                const baseName = path.basename(logPath, '.log');
                const oldPath = path.join(LOGS_DIR, `${baseName}.${date}.log`);

                // If dated file exists, append timestamp
                let finalPath = oldPath;
                if (fs.existsSync(oldPath)) {
                    const timestamp = Date.now();
                    finalPath = path.join(LOGS_DIR, `${baseName}.${date}.${timestamp}.log`);
                }

                fs.renameSync(logPath, finalPath);
            }
        }
    } catch (err) {
        // Ignore rotation errors
    }
}

/**
 * Write to log file
 */
function writeToLog(logPath, message) {
    try {
        rotateLogIfNeeded(logPath);
        fs.appendFileSync(logPath, message + '\n');
    } catch (err) {
        // Ignore write errors to prevent infinite loops
    }
}

/**
 * Determine which log file to write to based on message content
 * Returns only ONE file - the most specific match
 */
function getLogFile(message) {
    const msgLower = message.toLowerCase();

    // === PRIORITY ORDER: Most specific first ===

    // Portal logs (customer portal activity)
    if (msgLower.includes('[portal') || msgLower.includes('portal ')) {
        return LOG_FILES.portal;
    }

    // Authentication logs
    if (msgLower.includes('login') ||
        msgLower.includes('logout') ||
        msgLower.includes('[auth') ||
        msgLower.includes('session token') ||
        msgLower.includes('password reset')) {
        return LOG_FILES.auth;
    }

    // Plex-related logs (includes plex jobs, syncs, etc.)
    if (msgLower.includes('plex') || msgLower.includes('[plex')) {
        return LOG_FILES.plex;
    }

    // IPTV-related logs (includes iptv jobs, panel syncs, etc.)
    if (msgLower.includes('iptv') ||
        msgLower.includes('[iptv') ||
        msgLower.includes('panel ') ||
        msgLower.includes('xtream') ||
        msgLower.includes('m3u') ||
        msgLower.includes('bouquet')) {
        return LOG_FILES.iptv;
    }

    // Email-related logs (includes email scheduler)
    if (msgLower.includes('email') ||
        msgLower.includes('[email') ||
        msgLower.includes('smtp') ||
        msgLower.includes('sendgrid') ||
        msgLower.includes('mailgun')) {
        return LOG_FILES.email;
    }

    // Dashboard refresh logs
    if (msgLower.includes('[dashboard') ||
        msgLower.includes('dashboard refresh') ||
        msgLower.includes('dashboard stats')) {
        return LOG_FILES.dashboard;
    }

    // User management logs
    if (msgLower.includes('[user') ||
        msgLower.includes('user created') ||
        msgLower.includes('user updated') ||
        msgLower.includes('user deleted') ||
        msgLower.includes('app user')) {
        return LOG_FILES.users;
    }

    // Subscription changes
    if (msgLower.includes('subscription') ||
        msgLower.includes('[subscription') ||
        msgLower.includes('renewal') ||
        msgLower.includes('expir') ||
        msgLower.includes('[cancellation')) {
        return LOG_FILES.subscriptions;
    }

    // Default: general app log
    return LOG_FILES.app;
}

/**
 * Format arguments into a string
 */
function formatArgs(args) {
    return args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg, null, 2);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
}

/**
 * Initialize logger - intercepts console methods
 */
function initializeLogger() {
    // Intercept console.log
    console.log = function(...args) {
        const message = formatArgs(args);
        const timestamp = getTimestamp();
        const logEntry = `[${timestamp}] ${message}`;

        // Write to ONE appropriate log file only
        const logFile = getLogFile(message);
        writeToLog(logFile, logEntry);

        // Call original console.log
        originalConsoleLog.apply(console, args);
    };

    // Intercept console.error
    console.error = function(...args) {
        const message = formatArgs(args);
        const timestamp = getTimestamp();
        const logEntry = `[${timestamp}] [ERROR] ${message}`;

        // Always write errors to error.log
        writeToLog(LOG_FILES.error, logEntry);

        // Also write to the appropriate category log
        const logFile = getLogFile(message);
        if (logFile !== LOG_FILES.error) {
            writeToLog(logFile, logEntry);
        }

        // Call original console.error
        originalConsoleError.apply(console, args);
    };

    // Intercept console.warn
    console.warn = function(...args) {
        const message = formatArgs(args);
        const timestamp = getTimestamp();
        const logEntry = `[${timestamp}] [WARN] ${message}`;

        // Write to the appropriate category log
        const logFile = getLogFile(message);
        writeToLog(logFile, logEntry);

        // Call original console.warn
        originalConsoleWarn.apply(console, args);
    };

    // Log initialization
    const initMessage = `[${getTimestamp()}] === Logger initialized - Writing to ${LOGS_DIR} ===`;
    writeToLog(LOG_FILES.app, initMessage);
    originalConsoleLog('📝 Logger initialized - logs will be written to', LOGS_DIR);
}

/**
 * Get log file paths (for external use)
 */
function getLogFilePaths() {
    return LOG_FILES;
}

/**
 * Clear a specific log file
 */
function clearLog(logName) {
    const logPath = LOG_FILES[logName];
    if (logPath && fs.existsSync(logPath)) {
        fs.writeFileSync(logPath, '');
        return true;
    }
    return false;
}

/**
 * Get available log files with stats
 */
function getLogStats() {
    const stats = {};
    for (const [name, logPath] of Object.entries(LOG_FILES)) {
        if (fs.existsSync(logPath)) {
            const fileStat = fs.statSync(logPath);
            stats[name] = {
                path: logPath,
                size: fileStat.size,
                modified: fileStat.mtime
            };
        } else {
            stats[name] = {
                path: logPath,
                size: 0,
                modified: null
            };
        }
    }
    return stats;
}

/**
 * Update log settings
 */
function updateLogSettings(settings) {
    if (settings.maxFileSizeMB !== undefined) {
        LOG_SETTINGS.maxFileSizeMB = parseInt(settings.maxFileSizeMB) || 10;
    }
    if (settings.retentionDays !== undefined) {
        LOG_SETTINGS.retentionDays = parseInt(settings.retentionDays) || 7;
    }
    if (settings.maxLines !== undefined) {
        LOG_SETTINGS.maxLines = parseInt(settings.maxLines) || 50000;
    }
}

/**
 * Get current log settings
 */
function getLogSettings() {
    return { ...LOG_SETTINGS };
}

/**
 * Cleanup old log files based on retention settings
 * Returns summary of cleanup actions
 */
function cleanupOldLogs() {
    const results = {
        deleted: [],
        errors: [],
        totalSizeFreed: 0
    };

    try {
        const files = fs.readdirSync(LOGS_DIR);
        const now = Date.now();
        const retentionMs = LOG_SETTINGS.retentionDays * 24 * 60 * 60 * 1000;

        for (const file of files) {
            // Skip current log files (ones without date in name)
            const isCurrentLog = Object.values(LOG_FILES).some(
                logPath => path.basename(logPath) === file
            );
            if (isCurrentLog) continue;

            // Only process .log files
            if (!file.endsWith('.log')) continue;

            const filePath = path.join(LOGS_DIR, file);

            try {
                const stats = fs.statSync(filePath);
                const age = now - stats.mtime.getTime();

                // Delete if older than retention period
                if (age > retentionMs) {
                    fs.unlinkSync(filePath);
                    results.deleted.push(file);
                    results.totalSizeFreed += stats.size;
                }
            } catch (err) {
                results.errors.push({ file, error: err.message });
            }
        }

        if (results.deleted.length > 0) {
            originalConsoleLog(`[LOG CLEANUP] Deleted ${results.deleted.length} old log files, freed ${formatBytes(results.totalSizeFreed)}`);
        }

    } catch (err) {
        results.errors.push({ file: 'directory', error: err.message });
    }

    return results;
}

/**
 * Trim a log file to keep only the last N lines
 */
function trimLogFile(logPath, maxLines = LOG_SETTINGS.maxLines) {
    try {
        if (!fs.existsSync(logPath)) return false;

        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n');

        if (lines.length <= maxLines) return false;

        // Keep last N lines
        const trimmedLines = lines.slice(-maxLines);
        fs.writeFileSync(logPath, trimmedLines.join('\n'));

        originalConsoleLog(`[LOG TRIM] Trimmed ${logPath} from ${lines.length} to ${maxLines} lines`);
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Trim all log files to max lines
 */
function trimAllLogs() {
    const results = { trimmed: [], errors: [] };

    for (const [name, logPath] of Object.entries(LOG_FILES)) {
        try {
            if (trimLogFile(logPath)) {
                results.trimmed.push(name);
            }
        } catch (err) {
            results.errors.push({ name, error: err.message });
        }
    }

    return results;
}

/**
 * Get total size of all log files
 */
function getTotalLogSize() {
    let total = 0;
    try {
        const files = fs.readdirSync(LOGS_DIR);
        for (const file of files) {
            if (file.endsWith('.log')) {
                const stats = fs.statSync(path.join(LOGS_DIR, file));
                total += stats.size;
            }
        }
    } catch (err) {
        // Ignore errors
    }
    return total;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Run full cleanup (cleanup old files + trim current logs)
 */
function runFullCleanup() {
    const cleanupResults = cleanupOldLogs();
    const trimResults = trimAllLogs();

    return {
        cleanup: cleanupResults,
        trim: trimResults,
        totalLogSize: getTotalLogSize(),
        totalLogSizeFormatted: formatBytes(getTotalLogSize())
    };
}

module.exports = {
    initializeLogger,
    getLogFilePaths,
    clearLog,
    getLogStats,
    updateLogSettings,
    getLogSettings,
    cleanupOldLogs,
    trimLogFile,
    trimAllLogs,
    getTotalLogSize,
    runFullCleanup,
    LOG_FILES,
    LOG_CATEGORIES,
    LOGS_DIR
};
