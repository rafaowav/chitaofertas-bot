import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  LOG_LEVEL: optional('LOG_LEVEL', 'info'),

  // Database
  DATABASE_URL: required('DATABASE_URL'),

  // Telegram
  TELEGRAM_BOT_TOKEN: required('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_CHAT_ID: required('TELEGRAM_CHAT_ID'),

  // Shopee Affiliate API (source A)
  SHOPEE_APP_ID: optional('SHOPEE_APP_ID', ''),
  SHOPEE_SECRET: optional('SHOPEE_SECRET', ''),
  SHOPEE_BASE_URL: optional('SHOPEE_BASE_URL', 'https://open-api.affiliate.shopee.com.br/graphql'),

  // Shopee Product Page Scraper (source B — no longer functional)
  // Shopee blocks all non-browser API calls. Bot uses affiliate API pricing only.
  SHOPEE_SCRAPE_BASE_URL: optional('SHOPEE_SCRAPE_BASE_URL', 'https://shopee.com.br'),

  // Scheduling
  CRON_INTERVAL: optional('CRON_INTERVAL', '* * * * *'),

  // Price drop monitoring
  PRICE_DROP_CRON:         optional('PRICE_DROP_CRON', '0 */6 * * *'),
  PRICE_DROP_THRESHOLD:    optional('PRICE_DROP_THRESHOLD', '5'),
  PRICE_DROP_MIN_AMOUNT:   optional('PRICE_DROP_MIN_AMOUNT', '5'),
  PRICE_CHECK_BATCH_SIZE:  optional('PRICE_CHECK_BATCH_SIZE', '20'),
} as const;

export type Env = typeof env;
