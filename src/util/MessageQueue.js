'use strict';

const EventEmitter = require('events');

/**
 * Message queue for managing message sending with priority and persistence
 * @extends {EventEmitter}
 */
class MessageQueue extends EventEmitter {
    /**
     * @param {Client} client - WhatsApp client instance
     * @param {object} options - Queue options
     * @param {number} [options.concurrency=1] - Number of concurrent message sends
     * @param {number} [options.delayBetweenMs=500] - Delay between messages in milliseconds
     * @param {number} [options.maxQueueSize=1000] - Maximum queue size
     * @param {boolean} [options.autoStart=true] - Auto-start processing
     */
    constructor(client, options = {}) {
        super();
        this.client = client;
        this.concurrency = options.concurrency || 1;
        this.delayBetweenMs = options.delayBetweenMs || 500;
        this.maxQueueSize = options.maxQueueSize || 1000;
        this.autoStart = options.autoStart !== false;
        
        this.queue = [];
        this.processing = false;
        this.activeCount = 0;
        this.paused = false;
        
        this.stats = {
            enqueued: 0,
            processed: 0,
            successful: 0,
            failed: 0
        };
    }

    /**
     * Add a message to the queue
     * @param {string} chatId - Chat ID to send the message to
     * @param {string|MessageMedia|Location|Poll|Contact} content - Message content
     * @param {object} [options={}] - Message options
     * @param {number} [options.priority=5] - Priority (1-10, 1 is highest)
     * @param {object} [options.sendOptions] - Options passed to sendMessage
     * @returns {string} Message queue ID
     */
    enqueue(chatId, content, options = {}) {
        if (this.queue.length >= this.maxQueueSize) {
            throw new Error(`Queue is full (max: ${this.maxQueueSize})`);
        }

        const id = this._generateId();
        const priority = Math.max(1, Math.min(10, options.priority || 5));
        
        const queueItem = {
            id,
            chatId,
            content,
            sendOptions: options.sendOptions || {},
            priority,
            status: 'pending',
            createdAt: new Date(),
            attempts: 0
        };

        // Insert in priority order
        const insertIndex = this.queue.findIndex(item => item.priority > priority);
        if (insertIndex === -1) {
            this.queue.push(queueItem);
        } else {
            this.queue.splice(insertIndex, 0, queueItem);
        }

        this.stats.enqueued++;

        /**
         * Emitted when a message is added to the queue
         * @event MessageQueue#enqueued
         * @param {object} queueItem - The queued item
         */
        this.emit('enqueued', queueItem);

        if (this.autoStart && !this.processing && !this.paused) {
            this._startProcessing();
        }

        return id;
    }

    /**
     * Remove a message from the queue
     * @param {string} id - Queue item ID
     * @returns {boolean} True if removed, false if not found
     */
    dequeue(id) {
        const index = this.queue.findIndex(item => item.id === id);
        if (index === -1) return false;

        const [removed] = this.queue.splice(index, 1);
        removed.status = 'cancelled';

        /**
         * Emitted when a message is removed from the queue
         * @event MessageQueue#dequeued
         * @param {object} queueItem - The removed item
         */
        this.emit('dequeued', removed);

        return true;
    }

    /**
     * Start processing the queue
     */
    start() {
        this.paused = false;
        if (!this.processing) {
            this._startProcessing();
        }
    }

    /**
     * Pause queue processing
     */
    pause() {
        this.paused = true;
        this.emit('paused');
    }

    /**
     * Resume queue processing
     */
    resume() {
        this.paused = false;
        if (!this.processing) {
            this._startProcessing();
        }
        this.emit('resumed');
    }

    /**
     * Clear all pending messages from the queue
     */
    clear() {
        const cleared = this.queue.length;
        this.queue = [];
        this.emit('cleared', cleared);
    }

    /**
     * Get queue status
     * @returns {object} Queue status
     */
    getStatus() {
        return {
            pending: this.queue.filter(i => i.status === 'pending').length,
            processing: this.activeCount,
            paused: this.paused,
            stats: this.stats
        };
    }

    /**
     * Get all items in the queue
     * @param {string} [status] - Filter by status
     * @returns {Array<object>} Queue items
     */
    getAll(status = null) {
        if (status) {
            return this.queue.filter(item => item.status === status);
        }
        return [...this.queue];
    }

    /**
     * Get a specific queue item
     * @param {string} id - Queue item ID
     * @returns {object|null} Queue item or null
     */
    get(id) {
        return this.queue.find(item => item.id === id) || null;
    }

    /**
     * Start processing the queue
     * @private
     */
    async _startProcessing() {
        if (this.processing || this.paused) return;
        this.processing = true;

        this.emit('processing_started');

        while (this.queue.length > 0 && !this.paused) {
            // Wait if at concurrency limit
            while (this.activeCount >= this.concurrency) {
                await this._sleep(100);
                if (this.paused) break;
            }

            if (this.paused || this.queue.length === 0) break;

            const item = this.queue.find(i => i.status === 'pending');
            if (!item) break;

            item.status = 'processing';
            this.activeCount++;
            
            // Process without blocking
            this._processItem(item).finally(() => {
                this.activeCount--;
            });

            // Delay between starting new messages
            if (this.queue.some(i => i.status === 'pending')) {
                await this._sleep(this.delayBetweenMs);
            }
        }

        this.processing = false;
        this.emit('processing_stopped');
    }

    /**
     * Process a single queue item
     * @param {object} item - Queue item to process
     * @private
     */
    async _processItem(item) {
        item.attempts++;
        this.stats.processed++;

        try {
            item.startedAt = new Date();
            
            const message = await this.client.sendMessage(
                item.chatId,
                item.content,
                item.sendOptions
            );

            item.status = 'completed';
            item.completedAt = new Date();
            item.messageId = message?.id?._serialized;
            this.stats.successful++;

            /**
             * Emitted when a message is successfully sent
             * @event MessageQueue#success
             * @param {object} item - The processed item
             * @param {Message} message - The sent message
             */
            this.emit('success', item, message);

            // Remove from queue
            const index = this.queue.findIndex(i => i.id === item.id);
            if (index > -1) {
                this.queue.splice(index, 1);
            }
        } catch (error) {
            item.status = 'failed';
            item.error = error.message;
            item.failedAt = new Date();
            this.stats.failed++;

            /**
             * Emitted when a message fails to send
             * @event MessageQueue#failed
             * @param {object} item - The failed item
             * @param {Error} error - The error
             */
            this.emit('failed', item, error);

            // Remove from queue
            const index = this.queue.findIndex(i => i.id === item.id);
            if (index > -1) {
                this.queue.splice(index, 1);
            }
        }
    }

    /**
     * Generate unique ID
     * @returns {string}
     * @private
     */
    _generateId() {
        return `queue_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
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

module.exports = MessageQueue;
