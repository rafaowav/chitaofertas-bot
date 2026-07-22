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

  // Shopee Product Page Scraper (source B — free secondary source)
  // Fetches public product page to extract the real crossed-out price
  SHOPEE_SCRAPE_BASE_URL: optional('SHOPEE_SCRAPE_BASE_URL', 'https://shopee.com.br'),
  SHOPEE_SCRAPE_PRICE_DIVISOR: optional('SHOPEE_SCRAPE_PRICE_DIVISOR', '100000'),
  SHOPEE_SCRAPE_TIMEOUT_MS: optional('SHOPEE_SCRAPE_TIMEOUT_MS', '15000'),
  SHOPEE_SCRAPE_MAX_RETRIES: optional('SHOPEE_SCRAPE_MAX_RETRIES', '2'),

  // Scheduling
  CRON_INTERVAL: optional('CRON_INTERVAL', '* * * * *'),
} as const;

export type Env = typeof env;
