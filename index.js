require('dotenv').config();
const express = require('express');
const { Client } = require('discord.js-selfbot-v13');
const config = require('./config.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Global variables to track state
let isBumping = true;
let bumpCycleCount = 0;
let nextBumpTime = null;
const activeClients = new Map();
const accountStatus = new Map();
const countdownIntervals = new Map();

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
                
                // Set next bump time (2 hours from now)
                nextBumpTime = new Date(Date.now() + 7200000);
                console.log(`⏰ Next bump scheduled for: ${nextBumpTime.toLocaleTimeString()}`);
                
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

// FIXED: Function to send countdown messages from YOUR account
async function sendCountdownMessage(account) {
    console.log(`📢 Preparing to send countdown message from ${account.token.slice(0, 10)}...`);
    
    return new Promise(async (resolve) => {
        const client = new Client({
            checkUpdate: false,
            ws: { properties: { $browser: "Discord iOS" } }
        });

        // Set timeout for countdown message
        const timeout = setTimeout(() => {
            console.log(`❌ Countdown message timeout for account ${account.token.slice(0, 10)}`);
            client.destroy().catch(() => {});
            resolve();
        }, 15000);

        client.on('ready', async () => {
            clearTimeout(timeout);
            console.log(`✅ Countdown client ready for ${client.user.tag}`);
            
            try {
                // Send to the SAME channel as bumping
                const channel = await client.channels.fetch(account.channelId);
                
                if (nextBumpTime) {
                    const now = new Date();
                    const timeLeft = nextBumpTime - now;
                    
                    if (timeLeft > 0) {
                        const minutesLeft = Math.floor(timeLeft / 60000);
                        const hoursLeft = Math.floor(minutesLeft / 60);
                        const remainingMinutes = minutesLeft % 60;
                        
                        let message;
                        if (hoursLeft > 0) {
                            message = `⏰ Next bump in **${hoursLeft}h ${remainingMinutes}m** - ${nextBumpTime.toLocaleTimeString()}`;
                        } else if (minutesLeft > 0) {
                            message = `⏰ Next bump in **${minutesLeft}m** - ${nextBumpTime.toLocaleTimeString()}`;
                        } else {
                            message = `⏰ Bump time! Starting soon...`;
                        }
                        
                        // Send regular message (not slash command) from YOUR account
                        await channel.send(message);
                        console.log(`✅ Countdown sent from ${client.user.tag}: ${message}`);
                    } else {
                        // Send regular message when it's bump time
                        await channel.send("⏰ Bump time! Starting bump cycle soon...");
                        console.log(`✅ Bump time alert sent from ${client.user.tag}`);
                    }
                } else {
                    // Send regular message when no bump time is set yet
                    await channel.send("⏰ Bump timer starting... next bump time will be announced soon!");
                    console.log(`✅ Initial countdown message sent from ${client.user.tag}`);
                }
                
            } catch (error) {
                console.error(`❌ Countdown message failed from ${account.token.slice(0, 10)}:`, error.message);
            } finally {
                // Destroy client after sending message
                setTimeout(() => {
                    client.destroy().catch(() => {});
                    resolve();
                }, 1000);
            }
        });

        client.on('error', (error) => {
            clearTimeout(timeout);
            console.error(`❌ Countdown client error:`, error.message);
            client.destroy().catch(() => {});
            resolve();
        });

        // Login to send countdown
        try {
            await client.login(account.token);
        } catch (error) {
            clearTimeout(timeout);
            console.error(`❌ Countdown login failed:`, error.message);
            resolve();
        }
    });
}

// Start countdown messages for an account
function startCountdownForAccount(account) {
    console.log(`🔄 Starting countdown messages for account ${account.token.slice(0, 10)}...`);
    
    // Send initial message immediately
    sendCountdownMessage(account);
    
    // Set up interval for countdown messages (every 1 minute)
    const intervalId = setInterval(() => {
        sendCountdownMessage(account);
    }, 60000); // 1 minute
    
    countdownIntervals.set(account.token, intervalId);
}

// Stop countdown messages
function stopCountdownForAccount(account) {
    const intervalId = countdownIntervals.get(account.token);
    if (intervalId) {
        clearInterval(intervalId);
        countdownIntervals.delete(account.token);
        console.log(`🛑 Stopped countdown messages for account ${account.token.slice(0, 10)}`);
    }
}

// Improved bump loop with better error handling and delays
async function runBumpCycle() {
    bumpCycleCount++;
    console.log(`\n🔄 Starting bump cycle #${bumpCycleCount} at ${new Date().toLocaleTimeString()}`);
    
    for (const account of config.accounts) {
        const accountKey = account.token.slice(0, 15);
        console.log(`\n👤 Processing account: ${accountKey}...`);
        
        // Stop countdown during bump
        stopCountdownForAccount(account);
        
        await bumpWithAccount(account);
        
        // Restart countdown after bump
        startCountdownForAccount(account);
        
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
    
    // Start countdown messages for all accounts
    config.accounts.forEach(account => {
        startCountdownForAccount(account);
    });
    
    while (isBumping) {
        try {
            await runBumpCycle();
            
            // Wait 2 hours between cycles
            const waitTime = 7200000; // 2 hours in ms
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
        countdowns: countdownIntervals.size,
        nextBump: nextBumpTime ? nextBumpTime.toISOString() : null,
        accounts: status,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/status', (req, res) => {
    res.json({
        active: isBumping,
        cycles: bumpCycleCount,
        countdowns: countdownIntervals.size,
        nextBump: nextBumpTime ? nextBumpTime.toLocaleTimeString() : 'Not set',
        message: `Bump service is ${isBumping ? 'running' : 'stopped'}`
    });
});

app.get('/stop', (req, res) => {
    isBumping = false;
    // Destroy all active clients and stop countdowns
    activeClients.forEach(client => client.destroy());
    activeClients.clear();
    
    // Stop all countdown intervals
    countdownIntervals.forEach(interval => clearInterval(interval));
    countdownIntervals.clear();
    
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
    
    // Stop countdowns
    countdownIntervals.forEach(interval => clearInterval(interval));
    countdownIntervals.clear();
    
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
    countdownIntervals.forEach(interval => clearInterval(interval));
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
    console.log(`⏰ Countdown messages: EVERY 1 MINUTE`);
    console.log(`💬 Messages will be sent from YOUR account in the SAME channel`);
    
    // Start bump scheduler
    startBumpScheduler().catch(console.error);
});
