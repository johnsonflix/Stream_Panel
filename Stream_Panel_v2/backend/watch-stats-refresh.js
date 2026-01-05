// Background refresh function for watch stats - updates database
async function refreshWatchStatsInBackground() {
    const watchStatsRefreshing = global.watchStatsRefreshing || false;

    if (watchStatsRefreshing) {
        console.log('[WATCH STATS] Already refreshing, skipping...');
        return;
    }

    global.watchStatsRefreshing = true;
    console.log('[WATCH STATS] Starting background refresh...');

    try {
        const db = require('./database-config');
        const { spawn } = require('child_process');
        const path = require('path');

        // Get all active Plex servers
        const plexServers = await db.query(`
            SELECT id, name, url, server_id, token
            FROM plex_servers
            WHERE is_active = 1
            ORDER BY name
        `);

        if (plexServers.length === 0) {
            // Store empty stats in database
            const emptyStats = {
                mostPopularMovies: [],
                mostWatchedMovies: [],
                mostPopularShows: [],
                mostWatchedShows: [],
                mostActiveUsers: [],
                mostActivePlatforms: []
            };

            await db.query(`
                INSERT OR REPLACE INTO settings (setting_key, setting_value, updated_at)
                VALUES ('watch_stats_cache', ?, datetime('now'))
            `, [JSON.stringify(emptyStats)]);

            global.watchStatsRefreshing = false;
            console.log('[WATCH STATS] ✓ Background refresh complete (no servers)');
            return;
        }

        // Prepare server configurations for Python script
        const serverConfigs = plexServers.map(server => ({
            name: server.name,
            url: server.url,
            token: server.token
        }));

        // Call Python script to get watch statistics
        const pythonScript = path.join(__dirname, '../plex_watch_statistics.py');
        const pythonExecutable = process.env.PYTHON_PATH || 'python3';
        const pythonProcess = spawn(pythonExecutable, [pythonScript]);

        let stdoutData = '';
        let stderrData = '';

        // Send server configs to Python via stdin
        pythonProcess.stdin.write(JSON.stringify(serverConfigs));
        pythonProcess.stdin.end();

        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.log('[WATCH STATS Background]', data.toString());
        });

        // Wait for the Python process to complete
        await new Promise((resolve, reject) => {
            pythonProcess.on('close', async (code) => {
                if (code !== 0) {
                    console.error(`[WATCH STATS] Background refresh failed with code ${code}`);
                    console.error('[WATCH STATS] stderr:', stderrData);
                    global.watchStatsRefreshing = false;
                    resolve(); // Resolve even on error so we don't hang
                    return;
                }

                try {
                    const result = JSON.parse(stdoutData);

                    // Store in database
                    await db.query(`
                        INSERT OR REPLACE INTO settings (setting_key, setting_value, updated_at)
                        VALUES ('watch_stats_cache', ?, datetime('now'))
                    `, [JSON.stringify(result.stats)]);

                    global.watchStatsRefreshing = false;
                    console.log('[WATCH STATS] ✓ Background refresh complete');
                    resolve();
                } catch (error) {
                    console.error('[WATCH STATS] Background refresh error parsing output:', error);
                    global.watchStatsRefreshing = false;
                    resolve(); // Resolve even on error so we don't hang
                }
            });

            pythonProcess.on('error', (error) => {
                console.error('[WATCH STATS] Background refresh process error:', error);
                global.watchStatsRefreshing = false;
                resolve(); // Resolve even on error so we don't hang
            });
        });

    } catch (error) {
        console.error('[WATCH STATS] Background refresh error:', error);
        global.watchStatsRefreshing = false;
    }
}

module.exports = { refreshWatchStatsInBackground };
