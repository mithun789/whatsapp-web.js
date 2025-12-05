'use strict';

const EventEmitter = require('events');

/**
 * Enhanced error handler with retry logic for API operations
 * @extends {EventEmitter}
 */
class RetryHandler extends EventEmitter {
    /**
     * @param {object} options - Retry handler options
     * @param {number} [options.maxRetries=3] - Maximum number of retries
     * @param {number} [options.baseDelayMs=1000] - Base delay between retries in milliseconds
     * @param {number} [options.maxDelayMs=30000] - Maximum delay between retries
     * @param {boolean} [options.exponentialBackoff=true] - Use exponential backoff
     * @param {Array<string>} [options.retryableErrors] - List of error types that should trigger a retry
     */
    constructor(options = {}) {
        super();
        this.maxRetries = options.maxRetries || 3;
        this.baseDelayMs = options.baseDelayMs || 1000;
        this.maxDelayMs = options.maxDelayMs || 30000;
        this.exponentialBackoff = options.exponentialBackoff !== false;
        this.retryableErrors = options.retryableErrors || [
            'ETIMEDOUT',
            'ECONNRESET',
            'ENOTFOUND',
            'ESOCKETTIMEDOUT',
            'ECONNREFUSED',
            'EHOSTUNREACH',
            'EPIPE',
            'EAI_AGAIN',
            'ServerStatusCodeError',
            'TimeoutError',
            'NetworkError'
        ];
        this.stats = {
            totalAttempts: 0,
            successfulAttempts: 0,
            failedAttempts: 0,
            retriedAttempts: 0
        };
    }

    /**
     * Execute a function with retry logic
     * @param {Function} fn - Async function to execute
     * @param {object} [context={}] - Context object for logging/events
     * @returns {Promise<any>} Result of the function
     */
    async execute(fn, context = {}) {
        let lastError;
        let attempt = 0;

        while (attempt <= this.maxRetries) {
            this.stats.totalAttempts++;

            try {
                const result = await fn();
                this.stats.successfulAttempts++;

                if (attempt > 0) {
                    /**
                     * Emitted when an operation succeeds after retries
                     * @event RetryHandler#retrySuccess
                     * @param {object} info - Retry information
                     */
                    this.emit('retrySuccess', {
                        attempts: attempt + 1,
                        context
                    });
                }

                return result;
            } catch (error) {
                lastError = error;
                attempt++;

                const shouldRetry = this._shouldRetry(error, attempt);

                /**
                 * Emitted when an error occurs
                 * @event RetryHandler#error
                 * @param {Error} error - The error that occurred
                 * @param {object} info - Error information
                 */
                this.emit('error', error, {
                    attempt,
                    maxRetries: this.maxRetries,
                    willRetry: shouldRetry,
                    context
                });

                if (!shouldRetry) {
                    this.stats.failedAttempts++;
                    throw this._enhanceError(error, attempt, context);
                }

                this.stats.retriedAttempts++;
                const delay = this._calculateDelay(attempt);

                /**
                 * Emitted before a retry attempt
                 * @event RetryHandler#retry
                 * @param {object} info - Retry information
                 */
                this.emit('retry', {
                    attempt,
                    maxRetries: this.maxRetries,
                    delayMs: delay,
                    error: error.message,
                    context
                });

                await this._sleep(delay);
            }
        }

        this.stats.failedAttempts++;
        throw this._enhanceError(lastError, attempt, context);
    }

    /**
     * Check if the error should trigger a retry
     * @param {Error} error - The error to check
     * @param {number} attempt - Current attempt number
     * @returns {boolean}
     * @private
     */
    _shouldRetry(error, attempt) {
        if (attempt > this.maxRetries) {
            return false;
        }

        // Check if error type is retryable
        const errorCode = error.code || error.name || '';
        const isRetryable = this.retryableErrors.some(retryableError => 
            errorCode.includes(retryableError) || 
            (error.message && error.message.includes(retryableError))
        );

        return isRetryable;
    }

    /**
     * Calculate delay before next retry
     * @param {number} attempt - Current attempt number
     * @returns {number} Delay in milliseconds
     * @private
     */
    _calculateDelay(attempt) {
        let delay;
        
        if (this.exponentialBackoff) {
            // Exponential backoff with jitter
            delay = Math.min(
                this.maxDelayMs,
                this.baseDelayMs * Math.pow(2, attempt - 1)
            );
            // Add jitter (±25%)
            const jitter = delay * 0.25 * (Math.random() - 0.5) * 2;
            delay = Math.round(delay + jitter);
        } else {
            delay = this.baseDelayMs;
        }

        return Math.max(0, delay);
    }

    /**
     * Enhance error with retry information
     * @param {Error} error - Original error
     * @param {number} attempts - Number of attempts made
     * @param {object} context - Context object
     * @returns {Error}
     * @private
     */
    _enhanceError(error, attempts, context) {
        error.retryInfo = {
            attempts,
            maxRetries: this.maxRetries,
            context
        };
        return error;
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get retry statistics
     * @returns {object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalAttempts > 0 
                ? (this.stats.successfulAttempts / this.stats.totalAttempts * 100).toFixed(2) + '%'
                : 'N/A'
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalAttempts: 0,
            successfulAttempts: 0,
            failedAttempts: 0,
            retriedAttempts: 0
        };
    }

    /**
     * Add a retryable error type
     * @param {string} errorType - Error type to add
     */
    addRetryableError(errorType) {
        if (!this.retryableErrors.includes(errorType)) {
            this.retryableErrors.push(errorType);
        }
    }

    /**
     * Remove a retryable error type
     * @param {string} errorType - Error type to remove
     */
    removeRetryableError(errorType) {
        const index = this.retryableErrors.indexOf(errorType);
        if (index > -1) {
            this.retryableErrors.splice(index, 1);
        }
    }
}

module.exports = RetryHandler;
