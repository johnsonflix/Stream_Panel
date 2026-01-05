/**
 * Job Worker Utility
 *
 * Runs CPU-intensive background jobs in Worker threads to prevent
 * blocking the main event loop (and thus blocking API requests).
 *
 * Usage:
 *   const { runInWorker, JobWorkerPool } = require('./utils/job-worker');
 *   await runInWorker('./jobs/heavy-job.js', { param: 'value' });
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

/**
 * Run a job in a worker thread
 * @param {string} jobPath - Absolute path to the job file (must export a run() function)
 * @param {Object} data - Data to pass to the job
 * @param {number} timeout - Timeout in ms (default: 30 minutes)
 * @returns {Promise<any>} - Job result
 */
function runInWorker(jobPath, data = {}, timeout = 30 * 60 * 1000) {
    return new Promise((resolve, reject) => {
        const workerScript = path.join(__dirname, 'job-worker-runner.js');

        const worker = new Worker(workerScript, {
            workerData: {
                jobPath: path.resolve(jobPath),
                data
            }
        });

        const timeoutId = setTimeout(() => {
            worker.terminate();
            reject(new Error(`Worker timeout after ${timeout}ms`));
        }, timeout);

        worker.on('message', (result) => {
            clearTimeout(timeoutId);
            if (result.error) {
                reject(new Error(result.error));
            } else {
                resolve(result.data);
            }
        });

        worker.on('error', (error) => {
            clearTimeout(timeoutId);
            reject(error);
        });

        worker.on('exit', (code) => {
            clearTimeout(timeoutId);
            if (code !== 0) {
                reject(new Error(`Worker exited with code ${code}`));
            }
        });
    });
}

/**
 * Worker pool for managing multiple concurrent workers
 */
class JobWorkerPool {
    constructor(maxWorkers = 2) {
        this.maxWorkers = maxWorkers;
        this.activeWorkers = 0;
        this.queue = [];
    }

    /**
     * Run a job, queuing if necessary
     */
    async run(jobPath, data = {}, timeout = 30 * 60 * 1000) {
        if (this.activeWorkers >= this.maxWorkers) {
            // Queue the job
            return new Promise((resolve, reject) => {
                this.queue.push({ jobPath, data, timeout, resolve, reject });
            });
        }

        return this._executeJob(jobPath, data, timeout);
    }

    async _executeJob(jobPath, data, timeout) {
        this.activeWorkers++;

        try {
            const result = await runInWorker(jobPath, data, timeout);
            return result;
        } finally {
            this.activeWorkers--;
            this._processQueue();
        }
    }

    _processQueue() {
        if (this.queue.length > 0 && this.activeWorkers < this.maxWorkers) {
            const { jobPath, data, timeout, resolve, reject } = this.queue.shift();
            this._executeJob(jobPath, data, timeout)
                .then(resolve)
                .catch(reject);
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            activeWorkers: this.activeWorkers,
            queueLength: this.queue.length,
            maxWorkers: this.maxWorkers
        };
    }
}

// Global worker pool for background jobs
const backgroundJobPool = new JobWorkerPool(2);

module.exports = {
    runInWorker,
    JobWorkerPool,
    backgroundJobPool,
    isMainThread
};
