/**
 * Database Write Queue
 *
 * Serializes all database write operations to prevent SQLite lock contention.
 * Reads are not queued (SQLite handles concurrent reads fine with WAL mode).
 * Includes retry logic with exponential backoff for transient lock errors.
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
        // Retry configuration
        this.maxRetries = 5;
        this.baseDelayMs = 50; // Start with 50ms delay
    }

    /**
     * Add a write operation to the queue
     * @param {Function} operation - Synchronous function that performs the DB write
     * @returns {Promise} - Resolves with the operation result
     */
    write(operation) {
        return new Promise((resolve, reject) => {
            this.queue.push({ operation, resolve, reject, retries: 0 });
            this.processNext();
        });
    }

    /**
     * Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Process the next item in the queue
     */
    async processNext() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        const item = this.queue.shift();
        const { operation, resolve, reject, retries } = item;

        try {
            // Execute the synchronous better-sqlite3 operation
            const result = operation();
            resolve(result);
        } catch (error) {
            // Check if this is a recoverable lock error
            const isLockError = error.message && (
                error.message.includes('database is locked') ||
                error.message.includes('SQLITE_BUSY') ||
                error.code === 'SQLITE_BUSY'
            );

            if (isLockError && retries < this.maxRetries) {
                // Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms
                const delay = this.baseDelayMs * Math.pow(2, retries);
                console.warn(`[DB Queue] Lock contention, retry ${retries + 1}/${this.maxRetries} after ${delay}ms`);

                // Re-queue with incremented retry count
                item.retries = retries + 1;

                // Wait before retrying
                this.processing = false;
                await this.sleep(delay);

                // Put item back at front of queue
                this.queue.unshift(item);
                setImmediate(() => this.processNext());
                return;
            }

            // Not a lock error or max retries exceeded
            if (isLockError) {
                console.error(`[DB Queue] Write failed after ${this.maxRetries} retries:`, error.message);
            } else {
                console.error('[DB Queue] Write operation failed:', error.message);
            }
            reject(error);
        } finally {
            // Only mark as not processing if we didn't already (retry case)
            if (this.processing) {
                this.processing = false;
                // Process next item if queue not empty
                if (this.queue.length > 0) {
                    // Use setImmediate to prevent stack overflow on large queues
                    setImmediate(() => this.processNext());
                }
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
