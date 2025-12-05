'use strict';

const EventEmitter = require('events');
const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Webhook manager for sending events to external endpoints
 * @extends {EventEmitter}
 */
class WebhookManager extends EventEmitter {
    /**
     * @param {object} options - Webhook manager options
     * @param {number} [options.timeoutMs=10000] - Request timeout in milliseconds
     * @param {number} [options.maxRetries=3] - Maximum retry attempts for failed webhooks
     * @param {boolean} [options.enabled=true] - Whether webhooks are enabled
     */
    constructor(options = {}) {
        super();
        this.webhooks = new Map();
        this.timeoutMs = options.timeoutMs || 10000;
        this.maxRetries = options.maxRetries || 3;
        this.enabled = options.enabled !== false;
        this.stats = {
            totalSent: 0,
            successful: 0,
            failed: 0
        };
    }

    /**
     * Register a webhook for specific events
     * @param {string} id - Unique webhook ID
     * @param {string} url - Webhook URL
     * @param {Array<string>} events - Events to listen for (e.g., ['message', 'qr', 'ready'])
     * @param {object} [options={}] - Webhook options
     * @param {object} [options.headers] - Custom headers to include
     * @param {string} [options.secret] - Secret for signing payloads
     * @returns {object} Registered webhook configuration
     */
    register(id, url, events, options = {}) {
        // Validate URL
        try {
            new URL(url);
        } catch (error) {
            throw new Error(`Invalid webhook URL: ${url}`);
        }

        const webhook = {
            id,
            url,
            events: Array.isArray(events) ? events : [events],
            headers: options.headers || {},
            secret: options.secret || null,
            enabled: true,
            createdAt: new Date(),
            stats: { sent: 0, successful: 0, failed: 0 }
        };

        this.webhooks.set(id, webhook);

        /**
         * Emitted when a webhook is registered
         * @event WebhookManager#registered
         * @param {object} webhook - The registered webhook
         */
        this.emit('registered', webhook);

        return webhook;
    }

    /**
     * Unregister a webhook
     * @param {string} id - Webhook ID to unregister
     * @returns {boolean} True if unregistered, false if not found
     */
    unregister(id) {
        const webhook = this.webhooks.get(id);
        if (!webhook) return false;

        this.webhooks.delete(id);

        /**
         * Emitted when a webhook is unregistered
         * @event WebhookManager#unregistered
         * @param {object} webhook - The unregistered webhook
         */
        this.emit('unregistered', webhook);

        return true;
    }

    /**
     * Enable or disable a specific webhook
     * @param {string} id - Webhook ID
     * @param {boolean} enabled - Whether to enable or disable
     * @returns {boolean} True if updated, false if not found
     */
    setEnabled(id, enabled) {
        const webhook = this.webhooks.get(id);
        if (!webhook) return false;

        webhook.enabled = enabled;
        this.webhooks.set(id, webhook);

        return true;
    }

    /**
     * Trigger webhooks for a specific event
     * @param {string} eventName - Name of the event
     * @param {object} data - Event data to send
     * @returns {Promise<Array<object>>} Results of webhook calls
     */
    async trigger(eventName, data) {
        if (!this.enabled) return [];

        const results = [];
        const payload = {
            event: eventName,
            timestamp: new Date().toISOString(),
            data
        };

        for (const [id, webhook] of this.webhooks) {
            if (!webhook.enabled) continue;
            if (!webhook.events.includes(eventName) && !webhook.events.includes('*')) continue;

            const result = await this._sendWebhook(webhook, payload);
            results.push({ webhookId: id, ...result });
        }

        return results;
    }

    /**
     * Send webhook request
     * @param {object} webhook - Webhook configuration
     * @param {object} payload - Payload to send
     * @returns {Promise<object>} Result of the webhook call
     * @private
     */
    async _sendWebhook(webhook, payload) {
        let attempt = 0;
        let lastError;

        while (attempt < this.maxRetries) {
            try {
                this.stats.totalSent++;
                webhook.stats.sent++;

                const result = await this._makeRequest(webhook, payload);
                
                this.stats.successful++;
                webhook.stats.successful++;

                /**
                 * Emitted when a webhook is successfully sent
                 * @event WebhookManager#sent
                 * @param {object} info - Webhook info
                 */
                this.emit('sent', {
                    webhookId: webhook.id,
                    event: payload.event,
                    statusCode: result.statusCode
                });

                return { success: true, statusCode: result.statusCode, attempt: attempt + 1 };
            } catch (error) {
                lastError = error;
                attempt++;

                if (attempt < this.maxRetries) {
                    await this._sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
                }
            }
        }

        this.stats.failed++;
        webhook.stats.failed++;

        /**
         * Emitted when a webhook fails
         * @event WebhookManager#failed
         * @param {object} info - Failure info
         */
        this.emit('failed', {
            webhookId: webhook.id,
            event: payload.event,
            error: lastError.message,
            attempts: attempt
        });

        return { success: false, error: lastError.message, attempts: attempt };
    }

    /**
     * Make HTTP request to webhook URL
     * @param {object} webhook - Webhook configuration
     * @param {object} payload - Payload to send
     * @returns {Promise<object>} Response object
     * @private
     */
    _makeRequest(webhook, payload) {
        return new Promise((resolve, reject) => {
            const url = new URL(webhook.url);
            const isHttps = url.protocol === 'https:';
            const httpModule = isHttps ? https : http;

            const body = JSON.stringify(payload);
            const headers = {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'whatsapp-web.js-webhook',
                ...webhook.headers
            };

            // Add signature if secret is provided
            if (webhook.secret) {
                const crypto = require('crypto');
                const signature = crypto
                    .createHmac('sha256', webhook.secret)
                    .update(body)
                    .digest('hex');
                headers['X-Webhook-Signature'] = signature;
            }

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers,
                timeout: this.timeoutMs
            };

            const req = httpModule.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ statusCode: res.statusCode, body: data });
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(body);
            req.end();
        });
    }

    /**
     * Get all registered webhooks
     * @returns {Array<object>} Array of webhook configurations
     */
    getAll() {
        return Array.from(this.webhooks.values());
    }

    /**
     * Get a specific webhook
     * @param {string} id - Webhook ID
     * @returns {object|null} Webhook configuration or null
     */
    get(id) {
        return this.webhooks.get(id) || null;
    }

    /**
     * Get webhook statistics
     * @returns {object} Statistics object
     */
    getStats() {
        return {
            global: this.stats,
            webhooks: Array.from(this.webhooks.values()).map(w => ({
                id: w.id,
                stats: w.stats
            }))
        };
    }

    /**
     * Clear all webhooks
     */
    clear() {
        this.webhooks.clear();
        this.emit('cleared');
    }

    /**
     * Sleep utility
     * @param {number} ms - Milliseconds to sleep
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = WebhookManager;
