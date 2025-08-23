require('dotenv').config();
const express = require('express');
const { Client } = require('discord.js-selfbot-v13');
const config = require('./config.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Keep track of active clients to prevent memory leaks
const activeClients = new Set();

async function bumpWithAccount(account) {
  const client = new Client();

  return new Promise((resolve) => {
    activeClients.add(client);

    client.on('ready', async () => {
      console.log(`Logged in as ${client.user.tag} using token: ${account.token.slice(0, 10)}...`);

      try {
        const channel = await client.channels.fetch(account.channelId);
        await channel.sendSlash('302050872383242240', 'bump');
        console.log(`Bump command sent successfully by ${client.user.tag}`);
      } catch (error) {
        console.error(`Failed to send bump command for token ${account.token.slice(0, 10)}:`, error.message);
      } finally {
        client.destroy();
        activeClients.delete(client);
        resolve();
      }
    });

    client.login(account.token).catch((err) => {
      console.error(`Failed to login for token ${account.token.slice(0, 10)}:`, err.message);
      activeClients.delete(client);
      resolve();
    });
  });
}

async function runBumpCycle() {
  while (true) {
    for (const account of config.accounts) {
      console.log(`Processing bump for token: ${account.token.slice(0, 10)}...`);
      await bumpWithAccount(account);
      console.log(`Waiting 5 seconds before the next bump...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    console.log(`All accounts have sent the bump. Waiting 2 hours and 15 minutes before restarting...`);
    await new Promise((resolve) => setTimeout(resolve, 8100000));
  }
}

// Start the bump loop
runBumpCycle().catch(console.error);

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'running',
    message: 'Autobumpr service is running',
    accounts: config.accounts.map(a => ({
      token: `${a.token.slice(0, 5)}...${a.token.slice(-5)}`,
      channelId: a.channelId
    }))
  });
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  activeClients.forEach(client => client.destroy());
  setTimeout(() => process.exit(0), 5000);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
