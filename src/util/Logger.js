'use strict';

const EventEmitter = require('events');

/**
 * Log levels enumeration
 */
const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

/**
 * Enhanced logging system for the WhatsApp client
 * @extends {EventEmitter}
 */
class Logger extends EventEmitter {
    /**
     * @param {object} options - Logger options
     * @param {string} [options.prefix='WWebJS'] - Log prefix
     * @param {number} [options.level=LogLevel.INFO] - Minimum log level
     * @param {boolean} [options.timestamps=true] - Include timestamps in logs
     * @param {boolean} [options.colors=true] - Use colors in console output
     * @param {Function} [options.customFormatter] - Custom log formatter function
     * @param {Array<object>} [options.transports] - Custom log transports
     */
    constructor(options = {}) {
        super();
        this.prefix = options.prefix || 'WWebJS';
        this.level = options.level !== undefined ? options.level : LogLevel.INFO;
        this.timestamps = options.timestamps !== false;
        this.colors = options.colors !== false;
        this.customFormatter = options.customFormatter || null;
        this.transports = options.transports || [];
        this.logHistory = [];
        this.maxHistorySize = options.maxHistorySize || 1000;
        
        // ANSI color codes
        this._colors = {
            reset: '\x1b[0m',
            debug: '\x1b[36m',   // Cyan
            info: '\x1b[32m',    // Green
            warn: '\x1b[33m',    // Yellow
            error: '\x1b[31m',   // Red
            prefix: '\x1b[35m',  // Magenta
            timestamp: '\x1b[90m' // Gray
        };
    }

    /**
     * Log a debug message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    debug(message, ...args) {
        this._log(LogLevel.DEBUG, 'DEBUG', message, args);
    }

    /**
     * Log an info message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    info(message, ...args) {
        this._log(LogLevel.INFO, 'INFO', message, args);
    }

    /**
     * Log a warning message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    warn(message, ...args) {
        this._log(LogLevel.WARN, 'WARN', message, args);
    }

    /**
     * Log an error message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    error(message, ...args) {
        this._log(LogLevel.ERROR, 'ERROR', message, args);
    }

    /**
     * Log a message with a specific level
     * @param {number} level - Log level
     * @param {string} levelName - Level name
     * @param {string} message - Message to log
     * @param {Array} args - Additional arguments
     * @private
     */
    _log(level, levelName, message, args) {
        if (level < this.level) return;

        const timestamp = new Date();
        const logEntry = {
            level,
            levelName,
            message,
            args,
            timestamp,
            prefix: this.prefix
        };

        // Store in history
        this._addToHistory(logEntry);

        // Format the log message
        const formatted = this._format(logEntry);

        // Output to console
        this._outputToConsole(level, formatted);

        // Send to custom transports
        this._sendToTransports(logEntry);

        /**
         * Emitted when a log entry is created
         * @event Logger#log
         * @param {object} logEntry - The log entry
         */
        this.emit('log', logEntry);
    }

    /**
     * Format a log entry
     * @param {object} entry - Log entry
     * @returns {string} Formatted log string
     * @private
     */
    _format(entry) {
        if (this.customFormatter) {
            return this.customFormatter(entry);
        }

        const parts = [];

        // Timestamp
        if (this.timestamps) {
            const ts = entry.timestamp.toISOString();
            if (this.colors) {
                parts.push(`${this._colors.timestamp}[${ts}]${this._colors.reset}`);
            } else {
                parts.push(`[${ts}]`);
            }
        }

        // Prefix
        if (this.colors) {
            parts.push(`${this._colors.prefix}[${entry.prefix}]${this._colors.reset}`);
        } else {
            parts.push(`[${entry.prefix}]`);
        }

        // Level
        const levelColor = this._colors[entry.levelName.toLowerCase()] || '';
        if (this.colors) {
            parts.push(`${levelColor}[${entry.levelName}]${this._colors.reset}`);
        } else {
            parts.push(`[${entry.levelName}]`);
        }

        // Message
        parts.push(entry.message);

        // Additional args
        if (entry.args && entry.args.length > 0) {
            const argsStr = entry.args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg, null, 2);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');
            parts.push(argsStr);
        }

        return parts.join(' ');
    }

    /**
     * Output to console
     * @param {number} level - Log level
     * @param {string} message - Formatted message
     * @private
     */
    _outputToConsole(level, message) {
        switch (level) {
        case LogLevel.DEBUG:
            console.debug(message);
            break;
        case LogLevel.INFO:
            console.info(message);
            break;
        case LogLevel.WARN:
            console.warn(message);
            break;
        case LogLevel.ERROR:
            console.error(message);
            break;
        }
    }

    /**
     * Send to custom transports
     * @param {object} entry - Log entry
     * @private
     */
    _sendToTransports(entry) {
        for (const transport of this.transports) {
            try {
                if (typeof transport.log === 'function') {
                    transport.log(entry);
                }
            } catch (error) {
                console.error('Transport error:', error);
            }
        }
    }

    /**
     * Add entry to history
     * @param {object} entry - Log entry
     * @private
     */
    _addToHistory(entry) {
        this.logHistory.push(entry);
        if (this.logHistory.length > this.maxHistorySize) {
            this.logHistory.shift();
        }
    }

    /**
     * Get log history
     * @param {object} [options={}] - Filter options
     * @param {number} [options.level] - Filter by minimum level
     * @param {number} [options.limit] - Limit number of entries
     * @param {Date} [options.since] - Filter entries since date
     * @returns {Array<object>} Log entries
     */
    getHistory(options = {}) {
        let entries = [...this.logHistory];

        if (options.level !== undefined) {
            entries = entries.filter(e => e.level >= options.level);
        }

        if (options.since) {
            entries = entries.filter(e => e.timestamp >= options.since);
        }

        if (options.limit) {
            entries = entries.slice(-options.limit);
        }

        return entries;
    }

    /**
     * Clear log history
     */
    clearHistory() {
        this.logHistory = [];
    }

    /**
     * Set log level
     * @param {number} level - New log level
     */
    setLevel(level) {
        this.level = level;
    }

    /**
     * Add a custom transport
     * @param {object} transport - Transport object with a log method
     */
    addTransport(transport) {
        if (typeof transport.log !== 'function') {
            throw new Error('Transport must have a log method');
        }
        this.transports.push(transport);
    }

    /**
     * Remove a transport
     * @param {object} transport - Transport to remove
     * @returns {boolean} True if removed
     */
    removeTransport(transport) {
        const index = this.transports.indexOf(transport);
        if (index > -1) {
            this.transports.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Create a child logger with a different prefix
     * @param {string} prefix - Child logger prefix
     * @returns {Logger} New logger instance
     */
    child(prefix) {
        return new Logger({
            prefix: `${this.prefix}:${prefix}`,
            level: this.level,
            timestamps: this.timestamps,
            colors: this.colors,
            customFormatter: this.customFormatter,
            transports: this.transports
        });
    }
}

// Export both the class and the LogLevel enum
Logger.LogLevel = LogLevel;

module.exports = Logger;
