/**
 * Database Write Queue
 *
 * Serializes all database write operations to prevent SQLite lock contention.
 * Reads are not queued (SQLite handles concurrent reads fine with WAL mode).
 *
 * Usage:
 *   const dbQueue = require('./utils/db-write-queue');
 *
 *   // Instead of: db.prepare('INSERT...').run(...)
 *   // Use: await dbQueue.write(() => db.prepare('INSERT...').run(...))
 */

class DatabaseWriteQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }

    /**
     * Add a write operation to the queue
     * @param {Function} operation - Synchronous function that performs the DB write
     * @returns {Promise} - Resolves with the operation result
     */
    write(operation) {
        return new Promise((resolve, reject) => {
            this.queue.push({ operation, resolve, reject });
            this.processNext();
        });
    }

    /**
     * Process the next item in the queue
     */
    async processNext() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        const { operation, resolve, reject } = this.queue.shift();

        try {
            // Execute the synchronous better-sqlite3 operation
            const result = operation();
            resolve(result);
        } catch (error) {
            console.error('[DB Queue] Write operation failed:', error.message);
            reject(error);
        } finally {
            this.processing = false;
            // Process next item if queue not empty
            if (this.queue.length > 0) {
                // Use setImmediate to prevent stack overflow on large queues
                setImmediate(() => this.processNext());
            }
        }
    }

    /**
     * Get current queue length (for debugging)
     */
    get length() {
        return this.queue.length;
    }

    /**
     * Check if queue is currently processing
     */
    get isProcessing() {
        return this.processing;
    }
}

// Export singleton instance
module.exports = new DatabaseWriteQueue();
