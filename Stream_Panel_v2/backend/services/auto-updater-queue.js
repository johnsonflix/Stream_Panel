/**
 * Auto-Updater Queue Manager
 * Ensures only one auto-updater runs at a time across all playlists
 */

class AutoUpdaterQueue {
    constructor() {
        this.queue = [];
        this.currentJob = null;
        this.isProcessing = false;
        this.TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    }

    /**
     * Add a playlist to the queue
     * @param {number} playlistId - Playlist ID
     * @param {Function} runFunction - Function to execute the auto-updater
     * @returns {Promise} Promise that resolves when the job completes
     */
    async add(playlistId, playlistName, runFunction) {
        return new Promise((resolve, reject) => {
            const job = {
                playlistId,
                playlistName,
                runFunction,
                resolve,
                reject,
                addedAt: Date.now(),
                timeoutId: null
            };

            console.log(`📋 Adding ${playlistName} (ID: ${playlistId}) to auto-updater queue`);
            console.log(`   Current queue size: ${this.queue.length}`);
            console.log(`   Currently running: ${this.currentJob ? this.currentJob.playlistName : 'None'}`);

            this.queue.push(job);

            // Start processing if not already running
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }

    /**
     * Process the queue
     */
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const job = this.queue.shift();
            this.currentJob = job;

            const waitTime = Date.now() - job.addedAt;
            console.log(`🚀 Starting queued auto-updater: ${job.playlistName} (waited ${Math.round(waitTime / 1000)}s)`);

            try {
                // Set timeout for 10 minutes
                const timeoutPromise = new Promise((_, reject) => {
                    job.timeoutId = setTimeout(() => {
                        reject(new Error(`Auto-updater timed out after ${this.TIMEOUT_MS / 1000} seconds`));
                    }, this.TIMEOUT_MS);
                });

                // Race between the actual job and timeout
                const result = await Promise.race([
                    job.runFunction(),
                    timeoutPromise
                ]);

                // Clear timeout if job completed successfully
                if (job.timeoutId) {
                    clearTimeout(job.timeoutId);
                }

                console.log(`✅ Auto-updater completed successfully: ${job.playlistName}`);
                job.resolve(result);

            } catch (error) {
                // Clear timeout on error
                if (job.timeoutId) {
                    clearTimeout(job.timeoutId);
                }

                console.error(`❌ Auto-updater failed: ${job.playlistName}`, error);
                job.reject(error);
            }

            this.currentJob = null;

            // Small delay between jobs
            if (this.queue.length > 0) {
                console.log(`⏳ Waiting 2 seconds before starting next job...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        this.isProcessing = false;
        console.log(`✅ Auto-updater queue is now empty`);
    }

    /**
     * Get current queue status
     */
    getStatus() {
        return {
            isProcessing: this.isProcessing,
            queueLength: this.queue.length,
            currentJob: this.currentJob ? {
                playlistId: this.currentJob.playlistId,
                playlistName: this.currentJob.playlistName
            } : null,
            queuedJobs: this.queue.map(job => ({
                playlistId: job.playlistId,
                playlistName: job.playlistName,
                waitingSeconds: Math.round((Date.now() - job.addedAt) / 1000)
            }))
        };
    }

    /**
     * Check if a specific playlist is in the queue or currently running
     */
    isPlaylistQueued(playlistId) {
        const inQueue = this.queue.some(job => job.playlistId === playlistId);
        const isRunning = this.currentJob && this.currentJob.playlistId === playlistId;
        return inQueue || isRunning;
    }

    /**
     * Get position in queue for a playlist (0 = currently running, 1 = next, etc.)
     */
    getPlaylistPosition(playlistId) {
        if (this.currentJob && this.currentJob.playlistId === playlistId) {
            return 0; // Currently running
        }

        const queueIndex = this.queue.findIndex(job => job.playlistId === playlistId);
        if (queueIndex !== -1) {
            return queueIndex + 1; // Position in queue (1-indexed after current job)
        }

        return -1; // Not in queue
    }
}

// Export singleton instance
module.exports = new AutoUpdaterQueue();
