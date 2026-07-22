import { createServer } from 'node:http';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './db/index.js';
import { startScheduler } from './jobs/scheduler.js';
import { logger } from './lib/logger.js';
import { setWebhook } from './services/telegram/index.js';
import { handleUpdate } from './services/telegram/handler.js';

async function main(): Promise<void> {
  logger.info({ nodeEnv: env.NODE_ENV }, 'Starting Telegram Deals Bot');

  await connectDb();
  startScheduler();

  const WEBHOOK_PATH = '/webhook';
  const WEBHOOK_URL = `https://bot-ofertas-shopee.fly.dev${WEBHOOK_PATH}`;

  await setWebhook(WEBHOOK_URL);

  createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === WEBHOOK_PATH) {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const json = JSON.parse(body);
        handleUpdate(json).catch((err) => logger.error({ err }, 'Webhook handler error'));
      } catch {
        /* invalid JSON, ignore */
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    }
  }).listen(8080, () => logger.info('Health check / webhook server listening on :8080'));

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
