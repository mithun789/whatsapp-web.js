'use strict';

/**
 * Phone Number Pairing Example
 * 
 * This example demonstrates how to authenticate without scanning a QR code.
 * Instead, you enter your phone number and receive a pairing code that you
 * enter in the WhatsApp app on your phone.
 * 
 * Usage:
 *   node phone-pairing-example.js
 * 
 * Steps:
 *   1. Run this script
 *   2. Enter your phone number when prompted (or set PHONE_NUMBER env var)
 *   3. A pairing code will be displayed (e.g., "ABCD-EFGH")
 *   4. On your phone, go to WhatsApp > Linked Devices > Link a Device
 *   5. Tap "Link with phone number instead"
 *   6. Enter the pairing code
 *   7. Done! The session will be saved for future use
 */

const { Client, LocalAuth, Logger } = require('./index');
const readline = require('readline');

// Initialize logger
const logger = new Logger({
    prefix: 'PhonePairing',
    level: Logger.LogLevel.INFO,
    timestamps: true
});

/**
 * Prompt user for input
 */
function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

/**
 * Format phone number - remove all non-numeric characters
 */
function formatPhoneNumber(phone) {
    return phone.replace(/[^0-9]/g, '');
}

/**
 * Display pairing code in a nice format
 */
function displayPairingCode(code) {
    const matches = code.match(/.{1,4}/g);
    const formattedCode = matches ? matches.join('-') : code;
    
    console.log('\n' + '='.repeat(50));
    console.log('         PAIRING CODE');
    console.log('='.repeat(50));
    console.log(`\n         ${formattedCode}\n`);
    console.log('='.repeat(50));
    console.log('\nOn your phone:');
    console.log('1. Open WhatsApp');
    console.log('2. Go to Settings > Linked Devices');
    console.log('3. Tap "Link a Device"');
    console.log('4. Tap "Link with phone number instead"');
    console.log('5. Enter the code above');
    console.log('='.repeat(50) + '\n');
}

async function main() {
    // Get phone number from environment or prompt
    let phoneNumber = process.env.PHONE_NUMBER;
    
    if (!phoneNumber) {
        console.log('\n📱 Phone Number Pairing for WhatsApp Web.js\n');
        console.log('Enter your phone number in international format.');
        console.log('Examples:');
        console.log('  - US: 12025551234');
        console.log('  - UK: 447911123456');
        console.log('  - Brazil: 5511999998888');
        console.log('  - India: 919876543210\n');
        
        phoneNumber = await prompt('Phone number: ');
    }
    
    phoneNumber = formatPhoneNumber(phoneNumber);
    
    if (!phoneNumber || phoneNumber.length < 10) {
        logger.error('Invalid phone number. Please enter a valid phone number with country code.');
        process.exit(1);
    }
    
    logger.info(`Using phone number: ${phoneNumber}`);
    
    // Puppeteer configuration
    const puppeteerConfig = {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu'
        ]
    };
    
    // Add executable path if running in Docker
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    
    // Initialize client with phone number pairing
    const client = new Client({
        authStrategy: new LocalAuth({
            dataPath: process.env.AUTH_DATA_PATH || './.wwebjs_auth'
        }),
        puppeteer: puppeteerConfig,
        pairWithPhoneNumber: {
            phoneNumber,
            showNotification: true,
            intervalMs: 180000 // Refresh code every 3 minutes
        }
    });
    
    // Pairing code received
    client.on('code', (code) => {
        displayPairingCode(code);
    });
    
    // Still listen for QR in case phone pairing fails
    client.on('qr', (qr) => {
        logger.warn('Received QR code instead of pairing code.');
        logger.warn('This may happen if phone number pairing is not available.');
        logger.info('QR Code:', qr);
    });
    
    // Authentication successful
    client.on('authenticated', () => {
        logger.info('✅ Authentication successful!');
        logger.info('Session saved. Next time you run, no pairing needed.');
    });
    
    // Authentication failed
    client.on('auth_failure', (msg) => {
        logger.error('❌ Authentication failed:', msg);
        process.exit(1);
    });
    
    // Client ready
    client.on('ready', async () => {
        logger.info('🚀 WhatsApp client is ready!');
        
        const info = client.info;
        logger.info(`Connected as: ${info.pushname} (${info.wid.user})`);
        
        // Example: Send a test message to yourself
        // const myNumber = info.wid.user;
        // await client.sendMessage(`${myNumber}@c.us`, 'Hello from WhatsApp Web.js! 👋');
    });
    
    // Handle incoming messages
    client.on('message', async (msg) => {
        logger.debug(`Message from ${msg.from}: ${msg.body}`);
        
        if (msg.body === '!ping') {
            await msg.reply('pong 🏓');
        }
    });
    
    // Connection state changes
    client.on('disconnected', (reason) => {
        logger.warn('Client disconnected:', reason);
    });
    
    // Graceful shutdown
    const shutdown = async (signal) => {
        logger.info(`Received ${signal}. Shutting down...`);
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
    
    // Start the client
    logger.info('Initializing WhatsApp client...');
    logger.info('Please wait for the pairing code...\n');
    
    try {
        await client.initialize();
    } catch (error) {
        logger.error('Failed to initialize client:', error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
