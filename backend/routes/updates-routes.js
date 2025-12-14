const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// GitHub configuration
const GITHUB_REPO = 'johnsonflix/Stream_Panel';
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// Get current version
router.get('/current-version', async (req, res) => {
    try {
        const versionPath = path.join(__dirname, '../../version.json');

        if (!fs.existsSync(versionPath)) {
            return res.json({
                version: 'unknown',
                name: 'Stream Panel',
                releaseDate: null,
                description: 'Version file not found'
            });
        }

        const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        res.json(versionData);
    } catch (error) {
        console.error('Error reading version:', error);
        res.status(500).json({ error: 'Failed to read version information' });
    }
});

// Check for updates from GitHub
router.get('/check', async (req, res) => {
    try {
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Stream-Panel-Updater'
        };

        if (GITHUB_TOKEN) {
            headers['Authorization'] = `token ${GITHUB_TOKEN}`;
        }

        // Get latest commits from main branch
        const response = await fetch(
            `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/commits?per_page=10`,
            { headers }
        );

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const commits = await response.json();

        // Get current local commit
        let localCommit = null;
        try {
            const { stdout } = await execPromise('git rev-parse HEAD', {
                cwd: path.join(__dirname, '../..')
            });
            localCommit = stdout.trim();
        } catch (e) {
            console.log('Could not get local commit:', e.message);
        }

        // Get version.json from GitHub to compare versions
        let remoteVersion = null;
        try {
            const versionResponse = await fetch(
                `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/contents/version.json`,
                { headers }
            );

            if (versionResponse.ok) {
                const versionFile = await versionResponse.json();
                const content = Buffer.from(versionFile.content, 'base64').toString('utf8');
                remoteVersion = JSON.parse(content);
            }
        } catch (e) {
            console.log('Could not fetch remote version:', e.message);
        }

        // Read local version
        const versionPath = path.join(__dirname, '../../version.json');
        let localVersion = { version: 'unknown' };
        if (fs.existsSync(versionPath)) {
            localVersion = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        }

        // Check if update is available
        const latestCommit = commits[0]?.sha || null;

        // Compare versions semantically (handles case when git commit is unknown)
        const compareVersions = (local, remote) => {
            if (!local || !remote) return false;
            const localParts = local.split('.').map(Number);
            const remoteParts = remote.split('.').map(Number);
            for (let i = 0; i < 3; i++) {
                if ((remoteParts[i] || 0) > (localParts[i] || 0)) return true;
                if ((remoteParts[i] || 0) < (localParts[i] || 0)) return false;
            }
            return false; // versions are equal
        };

        // Update available if: commits differ OR remote version is higher
        const commitsDiffer = localCommit && latestCommit && localCommit !== latestCommit;
        const versionIsNewer = compareVersions(localVersion.version, remoteVersion?.version);
        const updateAvailable = commitsDiffer || versionIsNewer;

        // Count commits behind
        let commitsBehind = 0;
        if (localCommit && commits.length > 0) {
            for (let i = 0; i < commits.length; i++) {
                if (commits[i].sha === localCommit) {
                    commitsBehind = i;
                    break;
                }
            }
            // If local commit not found in recent commits, we're more than 10 behind
            if (commitsBehind === 0 && commits[0].sha !== localCommit) {
                commitsBehind = commits.length;
            }
        }

        res.json({
            updateAvailable,
            localVersion: localVersion.version,
            remoteVersion: remoteVersion?.version || localVersion.version,
            localCommit: localCommit?.substring(0, 7) || 'unknown',
            latestCommit: latestCommit?.substring(0, 7) || 'unknown',
            commitsBehind,
            recentCommits: commits.slice(0, 5).map(c => ({
                sha: c.sha.substring(0, 7),
                message: c.commit.message.split('\n')[0],
                author: c.commit.author.name,
                date: c.commit.author.date
            }))
        });

    } catch (error) {
        console.error('Error checking for updates:', error);
        res.status(500).json({ error: 'Failed to check for updates: ' + error.message });
    }
});

// Get changelog / recent commits
router.get('/changelog', async (req, res) => {
    try {
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Stream-Panel-Updater'
        };

        if (GITHUB_TOKEN) {
            headers['Authorization'] = `token ${GITHUB_TOKEN}`;
        }

        const response = await fetch(
            `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/commits?per_page=50`,
            { headers }
        );

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const commits = await response.json();

        res.json({
            commits: commits.map(c => ({
                sha: c.sha.substring(0, 7),
                fullSha: c.sha,
                message: c.commit.message,
                author: c.commit.author.name,
                date: c.commit.author.date,
                url: c.html_url
            }))
        });

    } catch (error) {
        console.error('Error fetching changelog:', error);
        res.status(500).json({ error: 'Failed to fetch changelog' });
    }
});

// Apply update
router.post('/apply', async (req, res) => {
    try {
        const appRoot = path.join(__dirname, '../..');

        // Step 1: Fetch latest changes
        console.log('[Update] Fetching latest changes...');
        await execPromise('git fetch origin main', { cwd: appRoot });

        // Step 2: Reset to latest (discards local changes to tracked files)
        console.log('[Update] Applying updates...');
        await execPromise('git reset --hard origin/main', { cwd: appRoot });

        // Step 3: Get new version info
        const versionPath = path.join(appRoot, 'version.json');
        let newVersion = { version: 'unknown' };
        if (fs.existsSync(versionPath)) {
            newVersion = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        }

        // Step 4: Get current commit
        const { stdout: commitHash } = await execPromise('git rev-parse HEAD', { cwd: appRoot });

        console.log(`[Update] Updated to version ${newVersion.version} (${commitHash.trim().substring(0, 7)})`);

        res.json({
            success: true,
            message: 'Update applied successfully. Please restart the container to complete the update.',
            version: newVersion.version,
            commit: commitHash.trim().substring(0, 7),
            requiresRestart: true
        });

    } catch (error) {
        console.error('Error applying update:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to apply update: ' + error.message
        });
    }
});

// Restart container (triggers rebuild)
router.post('/restart', async (req, res) => {
    try {
        console.log('[Update] Restart requested - container will restart shortly...');

        // Send response before exiting
        res.json({
            success: true,
            message: 'Restart initiated. The application will be back online shortly.'
        });

        // Give time for response to be sent, then exit
        // Docker's restart policy will bring the container back up
        setTimeout(() => {
            console.log('[Update] Exiting for restart...');
            process.exit(0);
        }, 1000);

    } catch (error) {
        console.error('Error initiating restart:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate restart'
        });
    }
});

module.exports = router;
