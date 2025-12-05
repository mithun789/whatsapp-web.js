'use strict';

/**
 * Example WhatsApp bot for Docker deployment
 * 
 * This example demonstrates how to run whatsapp-web.js in a Docker container
 * with proper configuration for headless Chromium.
 * 
 * Usage:
 *   docker build -t whatsapp-bot .
 *   docker run -it --shm-size=2gb -v wwebjs_auth:/app/.wwebjs_auth whatsapp-bot node docker-example.js
 * 
 * Or with docker-compose:
 *   docker-compose up
 */

const { Client, LocalAuth, Logger } = require('./index');

// Try to load qrcode-terminal (optional dependency)
let qrcode;
try {
    qrcode = require('qrcode-terminal');
} catch {
    qrcode = null;
}

// Initialize logger
const logger = new Logger({
    prefix: 'WhatsApp-Docker',
    level: Logger.LogLevel.INFO,
    timestamps: true
});

// Docker-optimized Puppeteer configuration
const puppeteerConfig = {
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-software-rasterizer',
        '--disable-features=site-per-process',
        '--disable-features=IsolateOrigins',
        '--disable-site-isolation-trials'
    ]
};

// Add executable path if running in Docker with system Chromium
if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
}

// Initialize WhatsApp client with Docker-friendly settings
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: process.env.AUTH_DATA_PATH || './.wwebjs_auth'
    }),
    puppeteer: puppeteerConfig,
    webVersionCache: {
        type: 'local',
        path: process.env.CACHE_PATH || './.wwebjs_cache'
    }
});

// QR Code event - displays QR in terminal for scanning
client.on('qr', (qr) => {
    logger.info('QR Code received. Scan with WhatsApp:');
    if (qrcode) {
        qrcode.generate(qr, { small: true });
    } else {
        logger.info('QR Code (install qrcode-terminal for visual display):');
        logger.info(qr);
    }
});

// Authentication events
client.on('authenticated', () => {
    logger.info('Authentication successful!');
});

client.on('auth_failure', (msg) => {
    logger.error('Authentication failed:', msg);
    process.exit(1);
});

// Ready event - client is fully initialized
client.on('ready', async () => {
    logger.info('WhatsApp client is ready!');
    
    const info = client.info;
    logger.info(`Connected as: ${info.pushname} (${info.wid.user})`);
    logger.info(`Platform: ${info.platform}`);
    
    const version = await client.getWWebVersion();
    logger.info(`WhatsApp Web version: ${version}`);
});

// Message event - handle incoming messages
client.on('message', async (msg) => {
    logger.debug(`Message from ${msg.from}: ${msg.body}`);
    
    // Example commands
    if (msg.body === '!ping') {
        await msg.reply('pong 🏓');
    }
    
    if (msg.body === '!info') {
        const chat = await msg.getChat();
        await msg.reply(`
*Bot Info*
Running in Docker: ${process.env.PUPPETEER_EXECUTABLE_PATH ? 'Yes' : 'No'}
Chat: ${chat.name || chat.id._serialized}
Platform: ${client.info.platform}
        `.trim());
    }
    
    if (msg.body === '!help') {
        await msg.reply(`
*Available Commands*
!ping - Check if bot is alive
!info - Show bot information
!help - Show this help message
        `.trim());
    }
});

// Connection state events
client.on('disconnected', (reason) => {
    logger.warn('Client disconnected:', reason);
});

client.on('change_state', (state) => {
    logger.info('Connection state changed:', state);
});

// Error handling
client.on('error', (error) => {
    logger.error('Client error:', error);
});

// Graceful shutdown
const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    try {
        await client.destroy();
        logger.info('Client destroyed successfully');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Initialize client
logger.info('Starting WhatsApp client...');
client.initialize().catch((error) => {
    logger.error('Failed to initialize client:', error);
    process.exit(1);
});
