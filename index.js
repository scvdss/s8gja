require('dotenv').config();
const express = require('express');
const { Client } = require('discord.js-selfbot-v13');
const config = require('./config.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Message configuration
const MESSAGE = "Gi ving steal a brainrot spawned brainrot serrvverr finder d(m) me f  aSRt";
const CHANNELS = [
    { id: "1404787770198855765", interval: 330000 },    // 5:30 mins = 330 seconds
    { id: "1404787780986343485", interval: 90000 },     // 1:30 mins = 90 seconds
    { id: "1396097266489491486", interval: 30000 },     // 30 seconds
    { id: "1396097530437042247", interval: 90000 },     // 1:30 mins = 90 seconds
    { id: "1374277094330335248", interval: 50000 }      // 50 seconds
];

// Track active clients and intervals
const activeClients = new Set();
const intervals = new Map();

async function sendMessageToChannel(account, channelId, message) {
    const client = new Client();

    return new Promise((resolve) => {
        activeClients.add(client);

        client.on('ready', async () => {
            console.log(`Logged in as ${client.user.tag} for channel ${channelId}`);

            try {
                const channel = await client.channels.fetch(channelId);
                await channel.send(message);
                console.log(`Message sent successfully to channel ${channelId} by ${client.user.tag}`);
            } catch (error) {
                console.error(`Failed to send message to channel ${channelId}:`, error.message);
            } finally {
                client.destroy();
                activeClients.delete(client);
                resolve();
            }
        });

        client.login(account.token).catch((err) => {
            console.error(`Failed to login for channel ${channelId}:`, err.message);
            activeClients.delete(client);
            resolve();
        });
    });
}

function startMessageScheduler(account) {
    console.log(`Starting message scheduler for account: ${account.token.slice(0, 10)}...`);
    
    CHANNELS.forEach((channelConfig, index) => {
        const intervalId = setInterval(async () => {
            console.log(`Sending message to channel ${channelConfig.id} (every ${channelConfig.interval/1000}s)...`);
            await sendMessageToChannel(account, channelConfig.id, MESSAGE);
        }, channelConfig.interval);

        intervals.set(`account-${index}-channel-${channelConfig.id}`, intervalId);
        console.log(`Scheduled messages for channel ${channelConfig.id} every ${channelConfig.interval/1000} seconds`);
    });
}

function stopAllIntervals() {
    intervals.forEach((intervalId, key) => {
        clearInterval(intervalId);
        console.log(`Stopped interval: ${key}`);
    });
    intervals.clear();
}

// Start the message scheduler for all accounts
config.accounts.forEach((account, index) => {
    console.log(`Initializing account ${index + 1}/${config.accounts.length}`);
    setTimeout(() => {
        startMessageScheduler(account);
    }, index * 5000); // Stagger startup by 5 seconds per account
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Discord Message Sender',
        accounts: config.accounts.length,
        channels: CHANNELS.length,
        message: MESSAGE,
        intervals: CHANNELS.map(ch => ({
            channel: ch.id,
            interval: `${ch.interval/1000} seconds`,
            formatted: formatInterval(ch.interval)
        })),
        uptime: process.uptime()
    });
});

// Helper function to format interval time
function formatInterval(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    
    if (minutes > 0) {
        return `${minutes}:${seconds.toString().padStart(2, '0')} minutes`;
    }
    return `${seconds} seconds`;
}

// Status endpoint
app.get('/status', (req, res) => {
    res.json({
        active: true,
        activeClients: activeClients.size,
        activeIntervals: intervals.size,
        message: 'Message scheduler is running'
    });
});

// Stop all intervals endpoint (for maintenance)
app.get('/stop', (req, res) => {
    stopAllIntervals();
    res.json({ message: 'All message intervals stopped' });
});

// Start all intervals endpoint
app.get('/start', (req, res) => {
    config.accounts.forEach((account, index) => {
        startMessageScheduler(account);
    });
    res.json({ message: 'Message intervals started' });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    stopAllIntervals();
    activeClients.forEach(client => client.destroy());
    setTimeout(() => process.exit(0), 3000);
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Message: "${MESSAGE}"`);
    console.log(`📊 Sending to ${CHANNELS.length} channels:`);
    
    CHANNELS.forEach(channel => {
        console.log(`   • ${channel.id} - every ${formatInterval(channel.interval)}`);
    });
    
    console.log(`🔗 Health check: http://localhost:${PORT}`);
});
