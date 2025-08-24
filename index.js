require('dotenv').config();
const express = require('express');
const { Client } = require('discord.js-selfbot-v13');
const config = require('./config.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Global variables to track state
let isBumping = true;
let bumpCycleCount = 0;
const activeClients = new Map();
const accountStatus = new Map();

// Improved bump function with better error handling
async function bumpWithAccount(account) {
    return new Promise(async (resolve) => {
        const client = new Client({
            checkUpdate: false,
            ws: { properties: { $browser: "Discord iOS" } }
        });

        const accountKey = account.token.slice(0, 15);
        activeClients.set(accountKey, client);
        accountStatus.set(accountKey, { status: 'connecting', lastBump: null });

        // Set timeout to prevent hanging
        const timeout = setTimeout(() => {
            console.log(`Timeout for account ${accountKey}`);
            client.destroy();
            accountStatus.set(accountKey, { status: 'timeout', lastBump: null });
            activeClients.delete(accountKey);
            resolve();
        }, 30000);

        client.on('ready', async () => {
            clearTimeout(timeout);
            accountStatus.set(accountKey, { status: 'connected', lastBump: new Date() });
            console.log(`✅ Logged in as ${client.user.tag} (${accountKey}...)`);

            try {
                const channel = await client.channels.fetch(account.channelId);
                await channel.sendSlash('302050872383242240', 'bump');
                console.log(`✅ Bump successful by ${client.user.tag}`);
                accountStatus.set(accountKey, { status: 'success', lastBump: new Date() });
            } catch (error) {
                console.error(`❌ Bump failed for ${client.user.tag}:`, error.message);
                accountStatus.set(accountKey, { status: 'error', lastBump: new Date(), error: error.message });
            } finally {
                // Always destroy client and clean up
                setTimeout(() => {
                    client.destroy();
                    activeClients.delete(accountKey);
                    resolve();
                }, 2000);
            }
        });

        client.on('error', (error) => {
            clearTimeout(timeout);
            console.error(`❌ Client error for ${accountKey}:`, error.message);
            accountStatus.set(accountKey, { status: 'client_error', lastBump: null, error: error.message });
            activeClients.delete(accountKey);
            resolve();
        });

        client.on('rateLimit', (info) => {
            console.log(`⚠️ Rate limited for ${accountKey}:`, info);
        });

        // Login with better error handling
        try {
            await client.login(account.token);
        } catch (error) {
            clearTimeout(timeout);
            console.error(`❌ Login failed for ${accountKey}:`, error.message);
            accountStatus.set(accountKey, { status: 'login_failed', lastBump: null, error: error.message });
            activeClients.delete(accountKey);
            resolve();
        }
    });
}

// Improved bump loop with better error handling and delays
async function runBumpCycle() {
    bumpCycleCount++;
    console.log(`\n🔄 Starting bump cycle #${bumpCycleCount} at ${new Date().toLocaleTimeString()}`);
    
    for (const account of config.accounts) {
        const accountKey = account.token.slice(0, 15);
        console.log(`\n👤 Processing account: ${accountKey}...`);
        
        await bumpWithAccount(account);
        
        // Wait between accounts to avoid rate limits
        if (config.accounts.length > 1) {
            console.log(`⏳ Waiting 10 seconds before next account...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    
    console.log(`\n✅ Cycle #${bumpCycleCount} completed at ${new Date().toLocaleTimeString()}`);
}

// Main bump scheduler with restart logic
async function startBumpScheduler() {
    console.log('🚀 Starting bump scheduler...');
    
    while (isBumping) {
        try {
            await runBumpCycle();
            
            // Wait 2 hours and 5 minutes (7500 seconds) between cycles
            const waitTime = 7500000; // 2h5m in ms
            console.log(`\n💤 Waiting ${waitTime/60000} minutes until next cycle...`);
            
            // Break the wait into smaller chunks to check if we should stop
            const chunkSize = 300000; // 5 minutes
            const chunks = waitTime / chunkSize;
            
            for (let i = 0; i < chunks; i++) {
                if (!isBumping) break;
                await new Promise(resolve => setTimeout(resolve, chunkSize));
                console.log(`⏰ ${((i + 1) * 5)} minutes passed...`);
            }
            
        } catch (error) {
            console.error('❌ Critical error in bump scheduler:', error);
            console.log('🔄 Restarting scheduler in 1 minute...');
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }
}

// Express server for health checks
app.use(express.json());

app.get('/', (req, res) => {
    const status = Array.from(accountStatus.entries()).map(([key, data]) => ({
        account: key,
        status: data.status,
        lastBump: data.lastBump,
        error: data.error || null
    }));
    
    res.json({
        status: 'online',
        bumping: isBumping,
        cycle: bumpCycleCount,
        activeClients: activeClients.size,
        accounts: status,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/status', (req, res) => {
    res.json({
        active: isBumping,
        cycles: bumpCycleCount,
        message: `Bump service is ${isBumping ? 'running' : 'stopped'}`
    });
});

app.get('/stop', (req, res) => {
    isBumping = false;
    // Destroy all active clients
    activeClients.forEach(client => client.destroy());
    activeClients.clear();
    res.json({ message: 'Bump service stopped', activeClients: activeClients.size });
});

app.get('/start', (req, res) => {
    if (!isBumping) {
        isBumping = true;
        startBumpScheduler();
        res.json({ message: 'Bump service started' });
    } else {
        res.json({ message: 'Bump service already running' });
    }
});

app.get('/restart', (req, res) => {
    isBumping = false;
    activeClients.forEach(client => client.destroy());
    activeClients.clear();
    
    setTimeout(() => {
        isBumping = true;
        startBumpScheduler();
    }, 2000);
    
    res.json({ message: 'Bump service restarting...' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    isBumping = false;
    activeClients.forEach(client => client.destroy());
    setTimeout(() => process.exit(0), 5000);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start everything
app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    console.log(`📊 Monitoring: http://localhost:${PORT}`);
    console.log(`🔧 Controls: /start, /stop, /restart`);
    console.log(`👥 Accounts: ${config.accounts.length}`);
    
    // Start bump scheduler
    startBumpScheduler().catch(console.error);
});
