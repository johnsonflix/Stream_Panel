/**
 * Job Worker Runner
 *
 * This script runs inside Worker threads and executes job modules.
 * It's used by job-worker.js to run CPU-intensive jobs without blocking the main thread.
 */

const { parentPort, workerData } = require('worker_threads');

async function runJob() {
    const { jobPath, data } = workerData;

    try {
        // Load the job module
        const jobModule = require(jobPath);

        // Check for different export patterns
        let result;

        if (typeof jobModule === 'function') {
            // Module exports a function directly
            result = await jobModule(data);
        } else if (typeof jobModule.run === 'function') {
            // Module exports { run: function }
            result = await jobModule.run(data);
        } else if (typeof jobModule.execute === 'function') {
            // Module exports { execute: function }
            result = await jobModule.execute(data);
        } else if (typeof jobModule.default === 'function') {
            // ES module default export
            result = await jobModule.default(data);
        } else {
            throw new Error(`Job module ${jobPath} does not export a runnable function (run, execute, or default)`);
        }

        // Send result back to main thread
        parentPort.postMessage({ data: result });

    } catch (error) {
        // Send error back to main thread
        parentPort.postMessage({
            error: error.message,
            stack: error.stack
        });
    }
}

runJob();
