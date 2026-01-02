const express = require('express');
const { Client } = require('discord.js-selfbot-v13');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Configuration from environment variables
const TOKEN = process.env.DISCORD_TOKEN;
const BUMP_CHANNEL_ID = "1456481675637952583";
const INTERVAL = (2 * 60 + 35) * 60 * 1000; // 2 hours and 35 minutes in milliseconds

// Express web server to keep the service alive
app.get('/', (req, res) => {
    res.send('Discord Bump Bot is running! Use this URL with UptimeRobot to keep it alive.');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web server running on port ${PORT}`);
});

const client = new Client();

client.on('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    let nextBumpTime = Date.now() + INTERVAL;

    const runBump = async () => {
        try {
            const channel = await client.channels.fetch(BUMP_CHANNEL_ID);
            if (channel) {
                await channel.sendSlash('302050872383242240', 'bump');
                console.log(`✅ Sent /bump to ${BUMP_CHANNEL_ID} at ${new Date().toLocaleTimeString()}`);
                nextBumpTime = Date.now() + INTERVAL;
            } else {
                console.error('❌ Channel not found');
            }
        } catch (error) {
            console.error('❌ Error sending bump:', error);
        }
    };

    // Update message every 3 minutes
    setInterval(async () => {
        try {
            const channel = await client.channels.fetch(BUMP_CHANNEL_ID);
            if (channel) {
                const diff = nextBumpTime - Date.now();
                const minutes = Math.floor(diff / (1000 * 60));
                if (minutes > 0) {
                    await channel.send(`⏳ Bumping in ${minutes} minutes...`);
                    console.log(`📡 Sent update: Bumping in ${minutes} minutes`);
                }
            }
        } catch (error) {
            console.error('❌ Error sending update:', error);
        }
    }, 3 * 60 * 1000);

    // Initial bump
    runBump();

    // Loop every 2h 35m
    setInterval(runBump, INTERVAL);
    console.log(`🚀 Starting bump loop for channel ${BUMP_CHANNEL_ID} every 2h 35m`);
});

client.login(TOKEN).catch(err => {
    console.error('❌ Failed to login:', err);
});
