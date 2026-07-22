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

async function runJob(): Promise<void> {
  if (running) {
    logger.warn('Job skipped — previous run still in progress');
    return;
  }
  running = true;

  try {
    const posted = await tryShopee();
    if (!posted) {
      logger.info('No new Shopee products available this cycle');
    }
  } finally {
    running = false;
  }
}

async function tryShopee(): Promise<boolean> {
  if (!env.SHOPEE_APP_ID || !env.SHOPEE_SECRET) {
    logger.debug('Shopee not configured, skipping');
    return false;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const products = await fetchOffers(20);
      if (products.length === 0) continue;

      for (const product of products) {
        const sourceId = String(product.itemId);
        if (!(await canPostOrUpdate('shopee', sourceId, product.price, product.title))) continue;

        /* Safety check: skip unrated products (primary filter in fetchOffers) */
        if (!isProductRated(product)) {
          logger.info({ itemId: product.itemId, title: product.title }, 'Skipping unrated product (secondary guard)');
          continue;
        }

        /* Two-source pipeline:
           1. Source A → affiliate data (already in product)
           2. Source B → enrich with real pricing from detail API
           3. If enrichment fails, fall back to affiliate-only data */
        const enriched = await enrichProduct(product);

        await postOffer(enriched);
        return true;
      }
    } catch (err) {
      logger.error({ err }, 'Shopee fetch failed');
    }
  }

  logger.info('No new products found after 5 attempts');
  return false;
}


