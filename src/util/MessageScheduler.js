'use strict';

const EventEmitter = require('events');

/**
 * Message scheduler for scheduling messages to be sent at a specific time
 * @extends {EventEmitter}
 */
class MessageScheduler extends EventEmitter {
    /**
     * @param {Client} client - WhatsApp client instance
     */
    constructor(client) {
        super();
        this.client = client;
        this.scheduledMessages = new Map();
        this.timers = new Map();
    }

    /**
     * Schedule a message to be sent at a specific time
     * @param {string} chatId - Chat ID to send the message to
     * @param {string|MessageMedia|Location|Poll|Contact} content - Message content
     * @param {Date} sendAt - Date/time when the message should be sent
     * @param {object} [options={}] - Message send options
     * @returns {string} Scheduled message ID
     */
    schedule(chatId, content, sendAt, options = {}) {
        const id = this._generateId();
        const now = Date.now();
        const delay = sendAt.getTime() - now;

        if (delay <= 0) {
            throw new Error('Scheduled time must be in the future');
        }

        const scheduledMessage = {
            id,
            chatId,
            content,
            options,
            sendAt,
            createdAt: new Date(),
            status: 'scheduled'
        };

        this.scheduledMessages.set(id, scheduledMessage);

        const timer = setTimeout(async () => {
            await this._executeScheduledMessage(id);
        }, delay);

        this.timers.set(id, timer);

        /**
         * Emitted when a message is scheduled
         * @event MessageScheduler#scheduled
         * @param {object} scheduledMessage - The scheduled message object
         */
        this.emit('scheduled', scheduledMessage);

        return id;
    }

    /**
     * Cancel a scheduled message
     * @param {string} id - Scheduled message ID
     * @returns {boolean} True if cancelled, false if not found
     */
    cancel(id) {
        const scheduledMessage = this.scheduledMessages.get(id);
        if (!scheduledMessage) return false;

        const timer = this.timers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(id);
        }

        scheduledMessage.status = 'cancelled';
        this.scheduledMessages.set(id, scheduledMessage);

        /**
         * Emitted when a scheduled message is cancelled
         * @event MessageScheduler#cancelled
         * @param {object} scheduledMessage - The cancelled scheduled message
         */
        this.emit('cancelled', scheduledMessage);

        return true;
    }

    /**
     * Reschedule a message to a new time
     * @param {string} id - Scheduled message ID
     * @param {Date} newSendAt - New send time
     * @returns {boolean} True if rescheduled, false if not found
     */
    reschedule(id, newSendAt) {
        const scheduledMessage = this.scheduledMessages.get(id);
        if (!scheduledMessage || scheduledMessage.status !== 'scheduled') {
            return false;
        }

        const now = Date.now();
        const delay = newSendAt.getTime() - now;

        if (delay <= 0) {
            throw new Error('Scheduled time must be in the future');
        }

        // Cancel existing timer
        const existingTimer = this.timers.get(id);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Update scheduled message
        scheduledMessage.sendAt = newSendAt;
        this.scheduledMessages.set(id, scheduledMessage);

        // Set new timer
        const timer = setTimeout(async () => {
            await this._executeScheduledMessage(id);
        }, delay);

        this.timers.set(id, timer);

        /**
         * Emitted when a scheduled message is rescheduled
         * @event MessageScheduler#rescheduled
         * @param {object} scheduledMessage - The rescheduled message
         */
        this.emit('rescheduled', scheduledMessage);

        return true;
    }

    /**
     * Get all scheduled messages
     * @param {string} [status] - Filter by status ('scheduled', 'sent', 'failed', 'cancelled')
     * @returns {Array<object>} Array of scheduled messages
     */
    getAll(status = null) {
        const messages = Array.from(this.scheduledMessages.values());
        if (status) {
            return messages.filter(m => m.status === status);
        }
        return messages;
    }

    /**
     * Get a specific scheduled message
     * @param {string} id - Scheduled message ID
     * @returns {object|null} The scheduled message or null if not found
     */
    get(id) {
        return this.scheduledMessages.get(id) || null;
    }

    /**
     * Clear all scheduled messages
     * @param {boolean} [cancelPending=true] - Whether to cancel pending messages
     */
    clear(cancelPending = true) {
        if (cancelPending) {
            for (const timer of this.timers.values()) {
                clearTimeout(timer);
            }
        }
        this.timers.clear();
        this.scheduledMessages.clear();

        /**
         * Emitted when all scheduled messages are cleared
         * @event MessageScheduler#cleared
         */
        this.emit('cleared');
    }

    /**
     * Execute a scheduled message
     * @param {string} id - Scheduled message ID
     * @private
     */
    async _executeScheduledMessage(id) {
        const scheduledMessage = this.scheduledMessages.get(id);
        if (!scheduledMessage || scheduledMessage.status !== 'scheduled') {
            return;
        }

        try {
            const sentMessage = await this.client.sendMessage(
                scheduledMessage.chatId,
                scheduledMessage.content,
                scheduledMessage.options
            );

            scheduledMessage.status = 'sent';
            scheduledMessage.sentAt = new Date();
            scheduledMessage.messageId = sentMessage?.id?._serialized;
            this.scheduledMessages.set(id, scheduledMessage);

            /**
             * Emitted when a scheduled message is successfully sent
             * @event MessageScheduler#sent
             * @param {object} scheduledMessage - The sent scheduled message
             * @param {Message} sentMessage - The sent Message object
             */
            this.emit('sent', scheduledMessage, sentMessage);
        } catch (error) {
            scheduledMessage.status = 'failed';
            scheduledMessage.error = error.message;
            this.scheduledMessages.set(id, scheduledMessage);

            /**
             * Emitted when a scheduled message fails to send
             * @event MessageScheduler#failed
             * @param {object} scheduledMessage - The failed scheduled message
             * @param {Error} error - The error that occurred
             */
            this.emit('failed', scheduledMessage, error);
        }

        this.timers.delete(id);
    }

    /**
     * Generate a unique ID for scheduled messages
     * @returns {string}
     * @private
     */
    _generateId() {
        return `sched_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }
}

module.exports = MessageScheduler;
