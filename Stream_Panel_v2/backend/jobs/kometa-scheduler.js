/**
 * Kometa Scheduler Job
 *
 * Runs every minute to check if any Kometa instances need to be executed
 * based on their configured schedule.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const KOMETA_APP_DIR = path.join(__dirname, '../../kometa_app');
const KOMETA_DATA_DIR = process.env.KOMETA_DATA_DIR || '/app/data/kometa';

// Track running processes to prevent duplicate runs
const runningProcesses = new Map();

/**
 * Check if Kometa is installed
 */
function isKometaInstalled() {
    const versionFile = path.join(KOMETA_APP_DIR, 'kometa_version.json');
    const kometaScript = path.join(KOMETA_APP_DIR, 'kometa.py');
    return fs.existsSync(versionFile) && fs.existsSync(kometaScript);
}

/**
 * Get all Kometa instances with their schedules
 */
function getInstances() {
    if (!fs.existsSync(KOMETA_DATA_DIR)) {
        return [];
    }

    const entries = fs.readdirSync(KOMETA_DATA_DIR, { withFileTypes: true });
    const instances = [];

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const metaPath = path.join(KOMETA_DATA_DIR, entry.name, 'instance.json');
            if (fs.existsSync(metaPath)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    instances.push({
                        id: entry.name,
                        ...meta
                    });
                } catch (e) {
                    console.error(`[Kometa Scheduler] Error reading instance ${entry.name}:`, e.message);
                }
            }
        }
    }

    return instances;
}

/**
 * Check if an instance should run based on its schedule
 */
function shouldRun(instance) {
    if (!instance.schedule || instance.schedule === 'manual') {
        return false;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Parse schedule
    // Format: "daily:HH" for daily at specific hour, "interval:N" for every N hours
    const [type, value] = instance.schedule.split(':');

    if (type === 'daily') {
        const scheduledHour = parseInt(value);
        // Run at the scheduled hour, minute 0
        if (currentHour === scheduledHour && currentMinute === 0) {
            return true;
        }
    } else if (type === 'interval') {
        const intervalHours = parseInt(value);
        // Run at top of hour if current hour is divisible by interval
        if (currentMinute === 0 && currentHour % intervalHours === 0) {
            return true;
        }
    }

    return false;
}

/**
 * Run Kometa for an instance
 */
function runKometa(instance) {
    const instanceId = instance.id;
    const instanceDir = path.join(KOMETA_DATA_DIR, instanceId);
    const configPath = path.join(instanceDir, 'config.yml');
    const kometaScript = path.join(KOMETA_APP_DIR, 'kometa.py');

    if (!fs.existsSync(configPath)) {
        console.error(`[Kometa Scheduler] No config.yml found for instance ${instanceId}`);
        return;
    }

    // Create log file
    const logsDir = path.join(instanceDir, 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFile = path.join(logsDir, `scheduled_${Date.now()}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    console.log(`[Kometa Scheduler] Starting scheduled run for instance ${instanceId}`);
    logStream.write(`=== Scheduled Kometa Run ===\n`);
    logStream.write(`Started at: ${new Date().toISOString()}\n`);
    logStream.write(`Instance: ${instance.name || instanceId}\n`);
    logStream.write(`Schedule: ${instance.schedule}\n\n`);

    // Spawn Kometa process
    const proc = spawn('python3', [kometaScript, '--config', configPath], {
        cwd: instanceDir,
        env: { ...process.env, KOMETA_CONFIG: configPath }
    });

    runningProcesses.set(instanceId, { process: proc, logFile, startTime: Date.now() });

    proc.stdout.on('data', (data) => {
        logStream.write(data);
    });

    proc.stderr.on('data', (data) => {
        logStream.write(data);
    });

    proc.on('close', (code) => {
        logStream.write(`\n=== Kometa finished with exit code ${code} ===\n`);
        logStream.end();
        runningProcesses.delete(instanceId);

        // Update instance metadata
        const metaPath = path.join(instanceDir, 'instance.json');
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                meta.lastRun = new Date().toISOString();
                meta.lastRunExitCode = code;
                meta.lastRunType = 'scheduled';
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
            } catch (e) {
                console.error(`[Kometa Scheduler] Error updating metadata for ${instanceId}:`, e.message);
            }
        }

        console.log(`[Kometa Scheduler] Finished scheduled run for instance ${instanceId} (exit code: ${code})`);
    });
}

/**
 * Main scheduler check - runs every minute
 */
function checkSchedules() {
    if (!isKometaInstalled()) {
        return;
    }

    const instances = getInstances();

    for (const instance of instances) {
        // Skip if already running
        if (runningProcesses.has(instance.id)) {
            continue;
        }

        if (shouldRun(instance)) {
            runKometa(instance);
        }
    }
}

/**
 * Initialize the Kometa scheduler
 */
function initKometaScheduler() {
    console.log('[Kometa Scheduler] Initializing...');

    // Run check every minute
    setInterval(checkSchedules, 60 * 1000);

    // Also run once at startup to catch any missed schedules
    // (but wait 30 seconds to let the app fully initialize)
    setTimeout(checkSchedules, 30 * 1000);

    console.log('[Kometa Scheduler] Scheduler initialized - checking every minute');
}

// Export for use in app.js
module.exports = {
    initKometaScheduler,
    runningProcesses // Export so kometa-routes can access running state
};
