import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { fetchOffers, enrichProduct, isProductRated } from '../services/shopee/index.js';
import { postOffer, canPostOrUpdate } from '../services/offers/index.js';

let running = false;

export function startScheduler(): void {
  logger.info({ cron: env.CRON_INTERVAL }, 'Starting cron scheduler');

  cron.schedule(env.CRON_INTERVAL, () => {
    runJob().catch((err) => logger.error({ err }, 'Scheduled job failed'));
  });
}

const MAX_POSTS_PER_CYCLE = 5;

async function runJob(): Promise<void> {
  if (running) {
    logger.warn('Job skipped — previous run still in progress');
    return;
  }
  running = true;

  try {
    const posted = await tryShopee();
    if (posted === 0) {
      logger.info('No new Shopee products available this cycle');
    } else {
      logger.info({ posted }, 'Shopee products posted this cycle');
    }
  } finally {
    running = false;
  }
}

async function tryShopee(): Promise<number> {
  if (!env.SHOPEE_APP_ID || !env.SHOPEE_SECRET) {
    logger.debug('Shopee not configured, skipping');
    return 0;
  }

  let totalPosted = 0;

  for (let attempt = 0; attempt < 5 && totalPosted < MAX_POSTS_PER_CYCLE; attempt++) {
    try {
      const products = await fetchOffers(20);
      if (products.length === 0) continue;

      for (const product of products) {
        if (totalPosted >= MAX_POSTS_PER_CYCLE) break;

        const sourceId = String(product.itemId);
        if (!(await canPostOrUpdate('shopee', sourceId, product.price, product.title))) continue;

        if (!isProductRated(product)) {
          logger.info({ itemId: product.itemId, title: product.title }, 'Skipping unrated product (secondary guard)');
          continue;
        }

        const enriched = await enrichProduct(product);
        const ok = await postOffer(enriched);
        if (ok) totalPosted++;
      }
    } catch (err) {
      logger.error({ err }, 'Shopee fetch failed');
    }
  }

  return totalPosted;
}


