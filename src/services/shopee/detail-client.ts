import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';

/* ------------------------------------------------------------------ */
/*  FREE secondary source — direct Shopee product-page scraping        */
/*                                                                     */
/*  Fetches the public Shopee product page and extracts the embedded   */
/*  product data from the __NEXT_DATA__ script tag.                    */
/*                                                                     */
/*  Product page URL:                                                  */
/*    https://shopee.com.br/product/{shopId}/{itemId}                  */
/*                                                                     */
/*  Embedded JSON fields used:                                         */
/*    data.product.price_before_discount  →  original crossed-out price*/
/*    data.product.price                 →  current price (not used)   */
/*    data.product.models[]              →  variant-level data         */
/*    data.product.models[].price_before_discount → variant original   */
/*    data.product.models[].price        →  variant current price      */
/*    data.shop_vouchers[]               →  active shop/seller vouchers*/
/*                                                                     */
/*  Price format: integers (BRL * 100000). Divisor configurable.       */
/*  Voucher discount: same integer format as prices.                   */
/* ------------------------------------------------------------------ */

const SCRAPE_TIMEOUT_MS = Number(env.SHOPEE_SCRAPE_TIMEOUT_MS) || 15_000;
const MAX_RETRIES = Number(env.SHOPEE_SCRAPE_MAX_RETRIES) || 2;
const PRICE_DIVISOR = Number(env.SHOPEE_SCRAPE_PRICE_DIVISOR) || 100_000;
const SHOPEE_BASE = env.SHOPEE_SCRAPE_BASE_URL || 'https://shopee.com.br';

/* ---------- Raw response types ---------- */

interface ScrapedVoucher {
  voucher_code?: string;
  discount?: number;
  min_spend?: number;
  start_time?: number;
  end_time?: number;
  voucher_name?: string;
  voucher_type?: number;
}

interface NextDataPayload {
  props?: {
    pageProps?: {
      data?: {
        product?: ScrapedProduct;
        shop_vouchers?: ScrapedVoucher[];
      };
    };
  };
}

interface ScrapedProduct {
  item_id: number;
  shop_id: number;
  name?: string;
  price?: number;
  price_before_discount?: number;
  discount?: string;
  images?: string[];
  models?: ScrapedModel[];
  tier_variations?: Array<{ name: string; options: string[] }>;
}

interface ScrapedModel {
  modelid: number;
  name?: string;
  price?: number;
  price_before_discount?: number;
  stock?: number;
}

interface PdpApiResponse {
  data?: {
    product?: ScrapedProduct;
    shop_vouchers?: ScrapedVoucher[];
  };
}

/* ---------- Our enrichment result ---------- */

export interface ScrapeEnrichmentResult {
  /** The best real original/crossed-out price */
  originalPrice: number | null;
  /** Which source field supplied originalPrice */
  originalPriceField: 'product_price_before_discount' | 'model_price_before_discount' | null;
  /** The currently displayed discounted price from the product page */
  currentPrice: number | null;
  /** Which source field supplied currentPrice */
  currentPriceField: 'product_price' | 'model_price' | null;
  /** Discount badge/percentage from the product page (e.g. 57 for 57%), or null */
  displayedDiscountPercent: number | null;
  /** Product has multiple models/variants */
  hasVariants: boolean;
  /** All models share the same price_before_discount */
  allOriginPricesSame: boolean;
  /** Raw model data for variant matching */
  models: ScrapedModel[];
  /** Reliable active shop voucher detected */
  hasReliableShopCoupon: boolean;
  /** Best coupon discount value in BRL decimal, or null */
  couponDiscountValue: number | null;
}

/* ---------- Helpers ---------- */

/** Convert Shopee integer price (e.g. 8550000 for R$85.50) to decimal */
function fromShopeePrice(raw: number | undefined | null): number | null {
  if (raw == null || raw <= 0) return null;
  return Math.round((raw / PRICE_DIVISOR) * 100) / 100;
}

/** Extract __NEXT_DATA__ JSON from HTML body */
function extractNextData(html: string): NextDataPayload | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as NextDataPayload;
  } catch {
    return null;
  }
}

/* ---------- Result container ---------- */

interface ProductPageResult {
  product: ScrapedProduct | null;
  vouchers: ScrapedVoucher[];
  source: 'api' | 'html';
}

/** Try GraphQL API endpoint first, then fall back to HTML scraping */
async function fetchProductPageRaw(
  itemId: number,
  shopId: number,
): Promise<ProductPageResult> {
  /* ---- Strategy 1: GraphQL API endpoint ---- */
  const apiUrl = `${SHOPEE_BASE}/api/v4/pdp/get_pc?item_id=${itemId}&shop_id=${shopId}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'application/json',
        Referer: `${SHOPEE_BASE}/product/${shopId}/${itemId}`,
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = (await res.json()) as PdpApiResponse;
      if (json?.data?.product) {
        return {
          product: json.data.product as ScrapedProduct,
          vouchers: json.data.shop_vouchers ?? [],
          source: 'api',
        };
      }
    }
  } catch {
    /* fall through to HTML strategy */
  }

  /* ---- Strategy 2: HTML product page (fallback) ---- */
  const pageUrl = `${SHOPEE_BASE}/product/${shopId}/${itemId}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const payload = extractNextData(html);
      if (payload?.props?.pageProps?.data?.product) {
        return {
          product: payload.props.pageProps.data.product as ScrapedProduct,
          vouchers: payload.props.pageProps.data.shop_vouchers ?? [],
          source: 'html',
        };
      }
    }
  } catch {
    /* give up */
  }

  return { product: null, vouchers: [], source: 'html' };
}

/* ---------- Main fetcher ---------- */

export async function fetchProductDetail(
  itemId: number,
  shopId: number,
): Promise<ScrapeEnrichmentResult | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { product, vouchers, source } = await fetchProductPageRaw(itemId, shopId);

      if (!product) {
        logger.warn(
          { itemId, shopId, attempt, provider: 'scrape' },
          'Shopee product page returned no product data',
        );
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
        continue;
      }

      const models = product.models ?? [];
      const hasVariants = models.length > 1;

      logger.info(
        { itemId, shopId, provider: 'scrape', source, hasVariants, modelCount: models.length, voucherCount: vouchers.length, attempt },
        'Shopee product page scraped successfully',
      );

      /* ---- Step 1: Extract original crossed-out price ---- */
      let originalPrice: number | null = null;
      let originalPriceField: 'product_price_before_discount' | 'model_price_before_discount' | null = null;
      let currentPrice: number | null = null;
      let currentPriceField: 'product_price' | 'model_price' | null = null;
      let displayedDiscountPercent: number | null = null;

      // Strategy A — model-level prices (variant level, most precise)
      if (models.length > 0) {
        const modelOriginals = models
          .map((m) => fromShopeePrice(m.price_before_discount))
          .filter((p): p is number => p != null);
        const modelCurrents = models
          .map((m) => fromShopeePrice(m.price))
          .filter((p): p is number => p != null);

        if (models.length === 1) {
          if (modelOriginals.length > 0) {
            originalPrice = modelOriginals[0];
            originalPriceField = 'model_price_before_discount';
          }
          if (modelCurrents.length > 0) {
            currentPrice = modelCurrents[0];
            currentPriceField = 'model_price';
          }
        } else {
          // Multi-model: use aggregate only when all share same price
          if (modelOriginals.length > 0) {
            const allSame = modelOriginals.every((p) => Math.abs(p - modelOriginals[0]) < 0.01);
            if (allSame) {
              originalPrice = modelOriginals[0];
              originalPriceField = 'model_price_before_discount';
            }
          }
          if (modelCurrents.length > 0) {
            const allSame = modelCurrents.every((p) => Math.abs(p - modelCurrents[0]) < 0.01);
            if (allSame) {
              currentPrice = modelCurrents[0];
              currentPriceField = 'model_price';
            }
          }
        }
      }

      // Strategy B — top-level prices (ONLY for products with no models at all)
      // Never use top-level prices for multi-model products: top-level price_before_discount
      // and price may refer to different variants, producing a misleading fake discount.
      if (models.length === 0) {
        if (originalPrice == null) {
          const top = fromShopeePrice(product.price_before_discount);
          if (top != null && top > 0) {
            originalPrice = top;
            originalPriceField = 'product_price_before_discount';
          }
        }
        if (currentPrice == null) {
          const top = fromShopeePrice(product.price);
          if (top != null && top > 0) {
            currentPrice = top;
            currentPriceField = 'product_price';
          }
        }
      }

      /* ---- Step 1b: Extract displayed discount badge ---- */
      if (product.discount != null && product.discount !== '') {
        const cleaned = String(product.discount).replace(/[^0-9]/g, '');
        const parsed = parseInt(cleaned, 10);
        if (!Number.isNaN(parsed) && parsed > 0 && parsed < 100) {
          displayedDiscountPercent = parsed;
        }
      }

      /* ---- Step 2: Determine if all model origin prices are the same ---- */
      const allOriginPricesSame = (() => {
        if (models.length <= 1) return true;
        const parsed = models
          .map((m) => fromShopeePrice(m.price_before_discount))
          .filter((p): p is number => p != null);
        if (parsed.length <= 1) return true;
        return parsed.every((p) => Math.abs(p - parsed[0]) < 0.01);
      })();

      /* ---- Step 3: Extract shop voucher/coupon ---- */
      const hasReliableShopCoupon = vouchers.length > 0;

      // Parse best coupon discount value
      let couponDiscountValue: number | null = null;
      if (hasReliableShopCoupon) {
        let bestValue = 0;
        for (const v of vouchers) {
          // Fixed-amount vouchers only — min_spend implies fixed discount
          // Discount is in same integer format as prices
          if (v.discount != null && v.discount > 0) {
            const parsed = fromShopeePrice(v.discount);
            if (parsed != null && parsed > bestValue) {
              bestValue = parsed;
            }
          }
        }
        if (bestValue > 0) {
          couponDiscountValue = Math.round(bestValue * 100) / 100;
        }
      }

      logger.info(
        {
          itemId,
          shopId,
          provider: 'scrape',
          source,
          hasVariants,
          modelCount: models.length,
          originalPrice,
          currentPrice,
          displayedDiscountPercent,
          hasReliableShopCoupon,
          couponDiscountValue,
          voucherCount: vouchers.length,
        },
        'Scrape enrichment succeeded',
      );

      return {
        originalPrice,
        originalPriceField,
        currentPrice,
        currentPriceField,
        displayedDiscountPercent,
        hasVariants,
        allOriginPricesSame,
        models,
        hasReliableShopCoupon,
        couponDiscountValue,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { itemId, shopId, provider: 'scrape', err: msg, attempt },
        'Shopee product scrape failed',
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  logger.error({ itemId, shopId, provider: 'scrape' }, 'Shopee product scrape exhausted retries');
  return null;
}

/* ------ Re-exported for shopee/index.ts ------ */

export function parsePrice(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
