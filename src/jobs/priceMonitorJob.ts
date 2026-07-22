import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { checkPriceDrops } from '../services/priceMonitor/index.js';

let running = false;

export function startPriceMonitor(): void {
  const expression = env.PRICE_DROP_CRON;
  logger.info({ cron: expression }, 'Starting price drop monitor scheduler');

  cron.schedule(expression, () => {
    runPriceCheck().catch((err) => logger.error({ err }, 'Price check job failed'));
  });
}

async function runPriceCheck(): Promise<void> {
  if (running) {
    logger.warn('Price check skipped — previous run still in progress');
    return;
  }
  running = true;

  try {
    const result = await checkPriceDrops();
    if (result.dropsNotified > 0) {
      logger.info(
        { checked: result.checked, dropsNotified: result.dropsNotified, notFound: result.notFound },
        'Price drops notified this cycle',
      );
    } else {
      logger.debug(
        { checked: result.checked, notFound: result.notFound },
        'No price drops detected this cycle',
      );
    }
  } finally {
    running = false;
  }
}
