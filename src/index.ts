import { createServer } from 'node:http';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './db/index.js';
import { startScheduler } from './jobs/scheduler.js';
import { logger } from './lib/logger.js';

async function main(): Promise<void> {
  logger.info({ nodeEnv: env.NODE_ENV }, 'Starting Telegram Deals Bot');

  await connectDb();
  startScheduler();

  createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  }).listen(8080, () => logger.info('Health check server listening on :8080'));

  logger.info('Bot is running. Press Ctrl+C to stop.');

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down...');
  await disconnectDb();
  process.exit(0);
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal error on startup');
  process.exit(1);
});
