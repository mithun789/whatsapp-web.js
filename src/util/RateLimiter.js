'use strict';

/**
 * Rate limiter for API calls to prevent hitting WhatsApp rate limits
 * Uses token bucket algorithm for flexible rate limiting
 */
class RateLimiter {
    /**
     * @param {object} options - Rate limiter options
     * @param {number} [options.maxRequests=30] - Maximum requests allowed in the time window
     * @param {number} [options.windowMs=60000] - Time window in milliseconds (default: 1 minute)
     * @param {number} [options.minDelayMs=100] - Minimum delay between requests in milliseconds
     */
    constructor(options = {}) {
        this.maxRequests = options.maxRequests || 30;
        this.windowMs = options.windowMs || 60000;
        this.minDelayMs = options.minDelayMs || 100;
        this.tokens = this.maxRequests;
        this.lastRefill = Date.now();
        this.queue = [];
        this.processing = false;
    }

    /**
     * Refill tokens based on elapsed time
     * @private
     */
    _refillTokens() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const refillAmount = (elapsed / this.windowMs) * this.maxRequests;
        this.tokens = Math.min(this.maxRequests, this.tokens + refillAmount);
        this.lastRefill = now;
    }

    /**
     * Check if a request can be made immediately
     * @returns {boolean}
     */
    canMakeRequest() {
        this._refillTokens();
        return this.tokens >= 1;
    }

    /**
     * Get the wait time until a request can be made
     * @returns {number} Wait time in milliseconds
     */
    getWaitTime() {
        this._refillTokens();
        if (this.tokens >= 1) return 0;
        const tokensNeeded = 1 - this.tokens;
        return Math.ceil((tokensNeeded / this.maxRequests) * this.windowMs);
    }

    /**
     * Consume a token for making a request
     * @returns {boolean} True if token was consumed, false if no tokens available
     */
    consumeToken() {
        this._refillTokens();
        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }
        return false;
    }

    /**
     * Wait for rate limit and then execute the function
     * @param {Function} fn - Function to execute
     * @returns {Promise<any>} Result of the function
     */
    async execute(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this._processQueue();
        });
    }

    /**
     * Process the queue of pending requests
     * @private
     */
    async _processQueue() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const waitTime = this.getWaitTime();
            if (waitTime > 0) {
                await this._sleep(waitTime);
            }
            
            if (this.consumeToken()) {
                const { fn, resolve, reject } = this.queue.shift();
                try {
                    const result = await fn();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
                
                // Add minimum delay between requests
                if (this.queue.length > 0) {
                    await this._sleep(this.minDelayMs);
                }
            }
        }
        
        this.processing = false;
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
     * Get current rate limiter status
     * @returns {object} Status object with tokens and queue length
     */
    getStatus() {
        this._refillTokens();
        return {
            availableTokens: Math.floor(this.tokens),
            maxTokens: this.maxRequests,
            queueLength: this.queue.length,
            windowMs: this.windowMs
        };
    }

    /**
     * Reset the rate limiter
     */
    reset() {
        this.tokens = this.maxRequests;
        this.lastRefill = Date.now();
        this.queue = [];
        this.processing = false;
    }
}

module.exports = RateLimiter;
